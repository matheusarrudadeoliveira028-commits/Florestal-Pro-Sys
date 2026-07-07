import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

export default function AusenciasScreen() {
  const [colaborador, setColaborador] = useState('');
  const [tipoAusencia, setTipoAusencia] = useState('Atestado'); 
  
  // ESTADOS PARA O ATESTADO
  const [dataAtestado, setDataAtestado] = useState('');
  const [diasAtestado, setDiasAtestado] = useState('');
  const [cidAtestado, setCidAtestado] = useState('');
  
  // ESTADOS PARA O ABONAMENTO
  const [dataAbono, setDataAbono] = useState('');
  const [motivoAbono, setMotivoAbono] = useState('');
  
  // ESTADOS DO SISTEMA OFFLINE
  const [listaColaboradores, setListaColaboradores] = useState<any[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [carregandoDados, setCarregandoDados] = useState(true);
  
  const [perfilLogado, setPerfilLogado] = useState<any>(null);
  const [ausenciasPendentes, setAusenciasPendentes] = useState<any[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  
  // ESTADOS DE EDIÇÃO OFFLINE
  const [modalPendentesVisivel, setModalPendentesVisivel] = useState(false);
  const [indexEdicao, setIndexEdicao] = useState<number | null>(null);

  // ESTADOS PARA EDIÇÃO ONLINE (BANCO DE DADOS)
  const [ausenciasOnline, setAusenciasOnline] = useState<any[]>([]);
  const [modalOnlineVisivel, setModalOnlineVisivel] = useState(false);
  const [carregandoOnline, setCarregandoOnline] = useState(false);
  const [idEdicaoOnline, setIdEdicaoOnline] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      carregarUsuarioLogado();
      carregarAusenciasLocais();
    }, [])
  );

  const carregarUsuarioLogado = async () => {
    try {
      const perfilSalvoStr = await AsyncStorage.getItem('@perfil_offline');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (session && !sessionError) {
        const { data: perfilData, error: perfilError } = await supabase.from('perfis').select('*').eq('id', session.user.id).single();
        if (perfilData && !perfilError) {
          setPerfilLogado(perfilData);
          await AsyncStorage.setItem('@perfil_offline', JSON.stringify(perfilData));
          carregarDadosBase(perfilData);
          setIsOffline(false);
        } else {
          acionarMochila(perfilSalvoStr);
        }
      } else {
        acionarMochila(perfilSalvoStr);
      }
    } catch (e) {
      const perfilSalvoStr = await AsyncStorage.getItem('@perfil_offline');
      acionarMochila(perfilSalvoStr);
    }
  };

  const acionarMochila = (perfilSalvoStr: string | null) => {
    setIsOffline(true);
    if (perfilSalvoStr) {
      const p = JSON.parse(perfilSalvoStr);
      setPerfilLogado(p);
      carregarDadosBase(p);
    }
  };

  const carregarDadosBase = async (perfilLido: any) => {
    setCarregandoDados(true);
    try {
      let { data: colabs, error } = await supabase.from('colaboradores').select('*').order('nome');
      if (error) throw new Error("Sem rede");

      if (colabs) {
        if (perfilLido && perfilLido.cargo !== 'Administrador') {
          colabs = colabs.filter(c => 
            c.fiscal_vinculado === perfilLido.nome || 
            c.fiscal_id === perfilLido.id
          );
        }
        setListaColaboradores(colabs);
        await AsyncStorage.setItem('@mochila_colaboradores', JSON.stringify(colabs));
      }
      setIsOffline(false);
    } catch (e) {
      setIsOffline(true);
      const mochilaColabs = await AsyncStorage.getItem('@mochila_colaboradores');
      if (mochilaColabs) {
        let colabsOff = JSON.parse(mochilaColabs);
        if (perfilLido && perfilLido.cargo !== 'Administrador') {
          colabsOff = colabsOff.filter((c: any) => 
            c.fiscal_vinculado === perfilLido.nome || 
            c.fiscal_id === perfilLido.id
          );
        }
        setListaColaboradores(colabsOff);
      }
    }
    setCarregandoDados(false);
  };

  const carregarAusenciasLocais = async () => {
    try {
      const dados = await AsyncStorage.getItem('@ausencias_off');
      if (dados) setAusenciasPendentes(JSON.parse(dados));
    } catch (e) {
      console.log("Erro ao carregar atestados offline");
    }
  };

  // === MÁSCARAS E CONVERSÕES DE DATA ===
  const aplicarMascaraData = (texto: string) => {
    let v = texto.replace(/\D/g, ''); 
    if (v.length > 8) v = v.substring(0, 8); 
    if (v.length > 4) v = v.replace(/^(\d{2})(\d{2})(\d{1,4}).*/, '$1/$2/$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{1,2}).*/, '$1/$2');
    return v;
  };

  const converterParaBanco = (dataBR: string) => {
    const partes = dataBR.split('/');
    if (partes.length === 3) return `${partes[2]}-${partes[1]}-${partes[0]}`;
    return null;
  };

  const converterParaUI = (dataBD: string | null) => {
    if (!dataBD) return '';
    const partes = dataBD.split('-');
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return dataBD;
  };

  // 👉 PREPARAR MODO DE EDIÇÃO OFFLINE
  const prepararEdicao = (index: number) => {
    const item = ausenciasPendentes[index];
    setColaborador(item.colaborador);
    
    if (item.servico && item.servico.startsWith('Abonado')) {
      setTipoAusencia('Abonado');
      setDataAbono(converterParaUI(item.data));
      const match = item.servico.match(/\((.*?)\)/);
      if (match) setMotivoAbono(match[1]);
      else setMotivoAbono('');
    } else {
      setTipoAusencia('Atestado');
      setDataAtestado(converterParaUI(item.data_atestado || item.data));
      setDiasAtestado(item.dias_atestado ? String(item.dias_atestado) : '');
      setCidAtestado(item.cid_atestado || '');
    }
    
    setIndexEdicao(index);
    setIdEdicaoOnline(null);
    setModalPendentesVisivel(false);
  };

  // 👉 BUSCAR E PREPARAR EDIÇÃO ONLINE (CÓDIGO CORRIGIDO PARA NÃO TRAVAR COM PARÊNTESES)
  const abrirHistoricoOnline = async () => {
    if (isOffline) return Alert.alert("Sem Conexão", "Você precisa de internet para buscar o histórico do banco de dados.");
    
    setModalOnlineVisivel(true);
    setCarregandoOnline(true);
    
    try {
      // Agora filtramos por "quantidade 0" e "fazenda '-'", que é a nossa regra exata para ausências!
      let query = supabase
        .from('diarios_campo')
        .select('*')
        .eq('quantidade', 0)
        .eq('fazenda', '-')
        .order('id', { ascending: false })
        .limit(50);

      // Se for fiscal, mostra apenas os lançamentos dele
      if (perfilLogado && perfilLogado.cargo !== 'Administrador') {
        query = query.eq('fiscal_nome', perfilLogado.nome);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (data) setAusenciasOnline(data);
    } catch (e) {
      Alert.alert("Erro", "Não foi possível buscar o histórico.");
    } finally {
      setCarregandoOnline(false);
    }
  };

  const prepararEdicaoOnline = (item: any) => {
    setColaborador(item.colaborador);
    
    if (item.servico && item.servico.startsWith('Abonado')) {
      setTipoAusencia('Abonado');
      setDataAbono(converterParaUI(item.data));
      const match = item.servico.match(/\((.*?)\)/);
      if (match) setMotivoAbono(match[1]);
      else setMotivoAbono('');
    } else {
      setTipoAusencia('Atestado');
      setDataAtestado(converterParaUI(item.data_atestado || item.data));
      setDiasAtestado(item.dias_atestado ? String(item.dias_atestado) : '');
      setCidAtestado(item.cid_atestado || '');
    }
    
    setIdEdicaoOnline(item.id);
    setIndexEdicao(null);
    setModalOnlineVisivel(false);
  };

  const excluirRegistroOnline = (id: number) => {
    Alert.alert(
      "Excluir Definitivamente",
      "Tem certeza que deseja apagar este registro do banco de dados?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Apagar",
          style: "destructive",
          onPress: async () => {
            setCarregandoOnline(true);
            const { error } = await supabase.from('diarios_campo').delete().eq('id', id);
            setCarregandoOnline(false);
            
            if (error) {
              Alert.alert("Erro", "Não foi possível excluir.");
            } else {
              setAusenciasOnline(prev => prev.filter(a => a.id !== id));
            }
          }
        }
      ]
    );
  };

  // 👉 CANCELAR QUALQUER MODO DE EDIÇÃO
  const cancelarEdicao = () => {
    setIndexEdicao(null);
    setIdEdicaoOnline(null);
    setColaborador('');
    setDataAtestado('');
    setDiasAtestado('');
    setCidAtestado('');
    setDataAbono('');
    setMotivoAbono('');
  };

  // 👉 SALVAR (NOVO, EDIÇÃO OFFLINE OU EDIÇÃO ONLINE)
  const salvarAusencia = async () => {
    if (!colaborador || !tipoAusencia) {
      return Alert.alert("Aviso", "Selecione o colaborador e o tipo de ocorrência!");
    }

    let dataLancamentoBD = null;

    if (tipoAusencia === 'Atestado') {
      if (!dataAtestado || dataAtestado.length !== 10 || !diasAtestado || !cidAtestado) {
        return Alert.alert("Aviso", "Preencha a data (completa), os dias e a CID do atestado médico!");
      }
      dataLancamentoBD = converterParaBanco(dataAtestado);
    }

    if (tipoAusencia === 'Abonado') {
      if (!dataAbono || dataAbono.length !== 10) {
        return Alert.alert("Aviso", "Preencha a data do abono corretamente (DD/MM/AAAA)!");
      }
      if (!motivoAbono.trim()) {
        return Alert.alert("Aviso", "Por favor, digite o motivo do abonamento pela empresa!");
      }
      dataLancamentoBD = converterParaBanco(dataAbono);
    }

    setSalvando(true);
    const servicoFinal = tipoAusencia === 'Abonado' ? `Abonado (${motivoAbono})` : tipoAusencia;

    const payload: any = { 
      colaborador: colaborador, 
      servico: servicoFinal,
      fazenda: '-', 
      quadra: '-', 
      ramal: '-', 
      quantidade: 0,
      valor_unitario: 0,
      valor_total: 0,
      data_atestado: tipoAusencia === 'Atestado' ? dataLancamentoBD : null,
      dias_atestado: tipoAusencia === 'Atestado' ? parseInt(diasAtestado) : null,
      cid_atestado: tipoAusencia === 'Atestado' ? cidAtestado : null,
      fiscal_nome: perfilLogado?.nome || 'Fiscal Não Identificado'
    };

    if (dataLancamentoBD) {
      payload.data = dataLancamentoBD;
    }

    try {
      // SE ESTIVER EDITANDO UM REGISTRO DA NUVEM
      if (idEdicaoOnline !== null) {
        const { error } = await supabase.from('diarios_campo').update(payload).eq('id', idEdicaoOnline);
        if (error) throw error;
        Alert.alert("✅ Sucesso", "Registro atualizado diretamente no banco de dados!");
        cancelarEdicao();
        setSalvando(false);
        return;
      }

      // SE NÃO, É FLUXO OFFLINE (NOVO OU EDIÇÃO DA FILA)
      let novaLista = [...ausenciasPendentes];
      if (indexEdicao !== null) {
        novaLista[indexEdicao] = payload;
      } else {
        novaLista.push(payload);
      }
      
      await AsyncStorage.setItem('@ausencias_off', JSON.stringify(novaLista));
      setAusenciasPendentes(novaLista);

      Alert.alert("✅ Sucesso!", indexEdicao !== null ? "Registro editado com sucesso." : `O registro de ${colaborador} está aguardando envio.`);
      cancelarEdicao();

    } catch (e) {
      Alert.alert("Erro", "Falha ao processar o registro.");
    } finally {
      setSalvando(false);
    }
  };

  // 👉 SINCRONIZAR COM O BANCO DE DADOS
  const sincronizarComBanco = async () => {
    if (ausenciasPendentes.length === 0) return;
    setSincronizando(true);

    try {
      const { error } = await supabase.from('diarios_campo').insert(ausenciasPendentes);
      if (error) throw error;
      
      await AsyncStorage.removeItem('@ausencias_off');
      setAusenciasPendentes([]);
      Alert.alert("🚀 Sincronizado com Sucesso!", "Todos os atestados/abonos foram enviados.");
    } catch (e: any) {
      Alert.alert("Erro na Sincronização", "Envio interrompido: " + e.message);
    } finally {
      setSincronizando(false);
    }
  };

  const excluirPendente = async (index: number) => {
    Alert.alert(
      "Excluir Registro",
      "Tem certeza que deseja apagar este atestado/abono do celular?",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Apagar", 
          style: "destructive",
          onPress: async () => {
            const novaLista = [...ausenciasPendentes];
            novaLista.splice(index, 1);
            await AsyncStorage.setItem('@ausencias_off', JSON.stringify(novaLista));
            setAusenciasPendentes(novaLista);

            if (indexEdicao === index) cancelarEdicao();
          }
        }
      ]
    );
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{flex: 1}}>
        {isOffline && (
          <View style={styles.offlineBadge}>
            <Text style={styles.offlineText}>⚠️ MODO OFFLINE ATIVADO - Registros salvos no celular.</Text>
          </View>
        )}

        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
          
          <View style={styles.topBar}>
            {perfilLogado ? (
              <Text style={styles.userText}>👤 {perfilLogado.cargo}: {perfilLogado.nome}</Text>
            ) : (
              <Text style={styles.userText}>Buscando perfil...</Text>
            )}
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>Controle de Ponto 📅</Text>
            <Text style={styles.subtitle}>Lançamento de Atestados e Abonos</Text>
          </View>

          {/* 👉 CARD DE SINCRONIZAÇÃO OFFLINE */}
          {ausenciasPendentes.length > 0 && (
            <View style={styles.syncCard}>
              <Text style={styles.syncTexto}>📦 {ausenciasPendentes.length} {ausenciasPendentes.length === 1 ? 'registro aguardando' : 'registros aguardando'}</Text>
              <View style={styles.syncBotoesRow}>
                <TouchableOpacity style={styles.btnSyncVer} onPress={() => setModalPendentesVisivel(true)}>
                  <Text style={styles.btnSyncVerTexto}>👁️ VER LISTA</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnSync} onPress={sincronizarComBanco} disabled={sincronizando || indexEdicao !== null || idEdicaoOnline !== null}>
                  {sincronizando ? <ActivityIndicator color="#F39C12" size="small" /> : <Text style={styles.btnSyncTexto}>🚀 ENVIAR TUDO</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={[styles.card, (indexEdicao !== null || idEdicaoOnline !== null) && { borderColor: '#F1C40F', borderWidth: 2 }]}>
            {carregandoDados ? (
              <View style={{alignItems: 'center', marginVertical: 20}}>
                <ActivityIndicator size="large" color="#3498DB" />
                <Text style={{marginTop: 10, color: '#7F8C8D'}}>Carregando equipe...</Text>
              </View>
            ) : (
              <>
                {(indexEdicao !== null || idEdicaoOnline !== null) && (
                  <View style={styles.edicaoAviso}>
                    <Text style={styles.edicaoAvisoTexto}>
                      ⚠️ EDITANDO {idEdicaoOnline !== null ? 'DADOS DA NUVEM' : 'DADOS OFFLINE'}
                    </Text>
                  </View>
                )}

                <Text style={styles.label}>Colaborador da sua Equipe:</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={colaborador} onValueChange={setColaborador} style={styles.picker}>
                    <Picker.Item label="Selecione quem ausentou..." value="" />
                    {listaColaboradores.map((item) => (
                      <Picker.Item key={item.id} label={item.nome} value={item.nome} />
                    ))}
                  </Picker>
                </View>

                <Text style={styles.label}>Tipo de Ocorrência:</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={tipoAusencia} onValueChange={setTipoAusencia} style={styles.picker}>
                    <Picker.Item label="Atestado Médico" value="Atestado" />
                    <Picker.Item label="Abonado pela Empresa" value="Abonado" />
                  </Picker>
                </View>

                {/* SEÇÃO DINÂMICA: SÓ APARECE SE FOR ATESTADO */}
                {tipoAusencia === 'Atestado' && (
                  <View style={styles.atestadoBox}>
                    <Text style={styles.atestadoTitulo}>Detalhes do Atestado 🏥</Text>
                    
                    <Text style={styles.label}>Data do Atestado:</Text>
                    <TextInput 
                      style={styles.input} 
                      placeholder="DD/MM/AAAA" 
                      keyboardType="numeric"
                      maxLength={10}
                      value={dataAtestado} 
                      onChangeText={(t) => setDataAtestado(aplicarMascaraData(t))} 
                    />

                    <View style={styles.row}>
                      <View style={styles.col}>
                        <Text style={styles.label}>Dias de Duração:</Text>
                        <TextInput 
                          style={styles.input} 
                          placeholder="Ex: 3" 
                          keyboardType="numeric" 
                          value={diasAtestado} 
                          onChangeText={setDiasAtestado} 
                        />
                      </View>
                      <View style={styles.col}>
                        <Text style={styles.label}>Código CID:</Text>
                        <TextInput 
                          style={styles.input} 
                          placeholder="Ex: J01.9" 
                          value={cidAtestado} 
                          onChangeText={setCidAtestado} 
                          autoCapitalize="characters"
                        />
                      </View>
                    </View>
                  </View>
                )}

                {/* SEÇÃO DINÂMICA: SÓ APARECE SE FOR ABONADO */}
                {tipoAusencia === 'Abonado' && (
                  <View style={styles.abonoBox}>
                    <Text style={styles.abonoTitulo}>Detalhes do Abonamento ✅</Text>
                    
                    <Text style={styles.label}>Data da Ausência:</Text>
                    <TextInput 
                      style={styles.input} 
                      placeholder="DD/MM/AAAA" 
                      keyboardType="numeric"
                      maxLength={10}
                      value={dataAbono} 
                      onChangeText={(t) => setDataAbono(aplicarMascaraData(t))} 
                    />

                    <Text style={styles.label}>Motivo do Abono:</Text>
                    <TextInput 
                      style={styles.input} 
                      placeholder="Ex: Doação de sangue, Casamento..." 
                      value={motivoAbono} 
                      onChangeText={setMotivoAbono} 
                    />
                  </View>
                )}

                <View style={[styles.avisoBox, tipoAusencia === 'Abonado' ? styles.avisoAbono : styles.avisoAtestado]}>
                  <Text style={styles.avisoTexto}>
                    {tipoAusencia === 'Abonado' 
                      ? "✅ Falta justificada/abonada pela empresa. O valor lançado será R$ 0,00." 
                      : "ℹ️ Ausência justificada (Saúde). O valor lançado será R$ 0,00."}
                  </Text>
                </View>

                {/* 👉 BOTÕES (MUDAM SE FOR EDIÇÃO OU NOVO) */}
                {indexEdicao !== null || idEdicaoOnline !== null ? (
                  <View style={styles.rowBotoesEdicao}>
                    <TouchableOpacity style={[styles.button, styles.btnCancelarEdicao]} onPress={cancelarEdicao}>
                      <Text style={styles.buttonText}>❌ CANCELAR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.button, styles.btnSalvarEdicao, salvando && styles.buttonDisabled]} onPress={salvarAusencia} disabled={salvando}>
                      {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>{idEdicaoOnline !== null ? '☁️ ATUALIZAR' : '💾 SALVAR'}</Text>}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity 
                    style={[styles.button, salvando ? styles.buttonDisabled : null, tipoAusencia === 'Abonado' ? styles.btnAbono : styles.btnAtestado]} 
                    onPress={salvarAusencia} 
                    disabled={salvando}
                  >
                    {salvando ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.buttonText}>Salvar {tipoAusencia} no Aparelho</Text>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.buttonAtualizar} onPress={() => carregarDadosBase(perfilLogado)}>
                  <Text style={styles.buttonAtualizarText}>↻ Recarregar Equipe</Text>
                </TouchableOpacity>

                {/* 👉 BOTÃO PARA ABRIR O HISTÓRICO ONLINE */}
                {!isOffline && indexEdicao === null && idEdicaoOnline === null && (
                  <TouchableOpacity style={styles.btnHistorico} onPress={abrirHistoricoOnline}>
                    <Ionicons name="cloud-download-outline" size={18} color="#FFF" style={{marginRight: 8}} />
                    <Text style={styles.btnHistoricoTexto}>EDITAR HISTÓRICO DA NUVEM</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
          <View style={{height: 50}} /> 
        </ScrollView>

        {/* 👉 MODAL DE ITENS PENDENTES (Fila Offline) */}
        <Modal visible={modalPendentesVisivel} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContentGrande}>
              <Text style={styles.modalTitle}>Ausências Pendentes</Text>
              <ScrollView style={{maxHeight: 500}}>
                {ausenciasPendentes.length === 0 ? (
                  <Text style={styles.textoVazio}>Nenhum registro offline.</Text>
                ) : (
                  ausenciasPendentes.map((item, index) => {
                    const dtFormatada = item.data ? item.data.split('-').reverse().join('/') : '';
                    return (
                      <View key={index} style={styles.itemPendente}>
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemColab}>{item.colaborador}</Text>
                          <Text style={styles.itemDetalhes}>{item.servico}</Text>
                          <Text style={styles.itemDetalhes}>Data Ocorrência: {dtFormatada}</Text>
                          {item.cid_atestado && <Text style={styles.itemDetalhes}>CID: {item.cid_atestado} ({item.dias_atestado} dias)</Text>}
                        </View>
                        <View style={styles.itemAcoes}>
                          <TouchableOpacity style={styles.btnEditarPendente} onPress={() => prepararEdicao(index)}>
                            <Text style={styles.btnAcaoTexto}>✏️</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.btnApagarPendente} onPress={() => excluirPendente(index)}>
                            <Text style={styles.btnAcaoTexto}>🗑️</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
              <TouchableOpacity style={styles.btnFecharModal} onPress={() => setModalPendentesVisivel(false)}>
                <Text style={styles.btnFecharTexto}>VOLTAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* 👉 MODAL DO HISTÓRICO ONLINE (Supabase) */}
        <Modal visible={modalOnlineVisivel} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContentGrande}>
              <Text style={styles.modalTitle}>Histórico na Nuvem ☁️</Text>
              
              {carregandoOnline ? (
                <View style={{padding: 40}}>
                  <ActivityIndicator size="large" color="#8E44AD" />
                  <Text style={{textAlign: 'center', marginTop: 10, color: '#7F8C8D'}}>Buscando no banco de dados...</Text>
                </View>
              ) : (
                <ScrollView style={{maxHeight: 500}}>
                  {ausenciasOnline.length === 0 ? (
                    <Text style={styles.textoVazio}>Nenhum registro encontrado no servidor.</Text>
                  ) : (
                    ausenciasOnline.map((item, index) => {
                      const dtFormatada = item.data ? item.data.split('-').reverse().join('/') : '';
                      return (
                        <View key={index} style={styles.itemPendente}>
                          <View style={styles.itemInfo}>
                            <Text style={styles.itemColab}>{item.colaborador}</Text>
                            <Text style={styles.itemDetalhes}>{item.servico}</Text>
                            <Text style={styles.itemDetalhes}>Data Ocorrência: {dtFormatada}</Text>
                            {item.cid_atestado && <Text style={styles.itemDetalhes}>CID: {item.cid_atestado} ({item.dias_atestado} dias)</Text>}
                          </View>
                          <View style={styles.itemAcoes}>
                            <TouchableOpacity style={styles.btnEditarPendente} onPress={() => prepararEdicaoOnline(item)}>
                              <Text style={styles.btnAcaoTexto}>✏️</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.btnApagarPendente} onPress={() => excluirRegistroOnline(item.id)}>
                              <Text style={styles.btnAcaoTexto}>🗑️</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              )}

              <TouchableOpacity style={styles.btnFecharModal} onPress={() => setModalOnlineVisivel(false)}>
                <Text style={styles.btnFecharTexto}>FECHAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', padding: 20 },
  offlineBadge: { backgroundColor: '#E74C3C', padding: 8, alignItems: 'center', justifyContent: 'center' },
  offlineText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  topBar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 15, marginBottom: 5, backgroundColor: '#FFF', padding: 12, borderRadius: 8, elevation: 2 },
  userText: { fontSize: 14, fontWeight: 'bold', color: '#2C3E50', textAlign: 'center' },
  header: { marginBottom: 20, marginTop: 10, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 16, color: '#7F8C8D', marginTop: 5 },
  
  syncCard: { backgroundColor: '#F39C12', padding: 15, borderRadius: 12, marginBottom: 20, alignItems: 'center' },
  syncTexto: { color: '#FFF', fontWeight: 'bold', marginBottom: 10 },
  syncBotoesRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  btnSyncVer: { backgroundColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8, flex: 1, marginRight: 10, alignItems: 'center' },
  btnSyncVerTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  btnSync: { backgroundColor: '#FFF', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8, flex: 1, alignItems: 'center' },
  btnSyncTexto: { color: '#F39C12', fontWeight: 'bold', fontSize: 12 },

  card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 15, elevation: 5 },
  label: { fontSize: 14, fontWeight: '700', color: '#34495E', marginBottom: 5, marginTop: 15 },
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', overflow: 'hidden' },
  picker: { height: 50, width: '100%', borderWidth: 0, backgroundColor: 'transparent' },
  
  input: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#F8FAFC', color: '#2C3E50', height: 50 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { width: '48%' },
  
  atestadoBox: { backgroundColor: '#EBF5FB', padding: 15, borderRadius: 10, marginTop: 15, borderWidth: 1, borderColor: '#AED6F1' },
  atestadoTitulo: { fontSize: 16, fontWeight: 'bold', color: '#2980B9', marginBottom: 5, textAlign: 'center' },

  abonoBox: { backgroundColor: '#EAEDED', padding: 15, borderRadius: 10, marginTop: 15, borderWidth: 1, borderColor: '#BDC3C7' },
  abonoTitulo: { fontSize: 16, fontWeight: 'bold', color: '#34495E', marginBottom: 5, textAlign: 'center' },

  avisoBox: { padding: 15, borderRadius: 8, marginTop: 20, borderWidth: 1 },
  avisoAbono: { backgroundColor: '#EAEDED', borderColor: '#7F8C8D' },
  avisoAtestado: { backgroundColor: '#E8F8F5', borderColor: '#27AE60' },
  avisoTexto: { color: '#2C3E50', fontSize: 14, textAlign: 'center', fontWeight: '500' },

  button: { padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 25 },
  btnAbono: { backgroundColor: '#34495E' },
  btnAtestado: { backgroundColor: '#3498DB' },
  buttonDisabled: { backgroundColor: '#95A5A6' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  buttonAtualizar: { backgroundColor: '#E0E6ED', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  buttonAtualizarText: { color: '#34495E', fontSize: 14, fontWeight: 'bold' },

  btnHistorico: { backgroundColor: '#8E44AD', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 25, flexDirection: 'row', justifyContent: 'center' },
  btnHistoricoTexto: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },

  // Estilos da Edição
  edicaoAviso: { backgroundColor: '#FCF3CF', padding: 10, borderRadius: 8, marginBottom: 15, alignItems: 'center' },
  edicaoAvisoTexto: { color: '#D35400', fontWeight: 'bold', fontSize: 12 },
  rowBotoesEdicao: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25 },
  btnCancelarEdicao: { flex: 1, marginRight: 10, backgroundColor: '#E74C3C', marginTop: 0 },
  btnSalvarEdicao: { flex: 1, backgroundColor: '#27AE60', marginTop: 0 },

  // Estilos do Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContentGrande: { backgroundColor: '#FFF', width: '100%', borderRadius: 15, padding: 20, elevation: 10, flex: 0.9 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E50', marginBottom: 15, textAlign: 'center' },
  textoVazio: { textAlign: 'center', color: '#7F8C8D', marginVertical: 20 },
  itemPendente: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#D5DBDB', borderRadius: 8, padding: 12, marginBottom: 10, alignItems: 'center' },
  itemInfo: { flex: 1 },
  itemColab: { fontSize: 16, fontWeight: 'bold', color: '#2C3E50' },
  itemDetalhes: { fontSize: 13, color: '#7F8C8D', marginTop: 2 },
  itemAcoes: { flexDirection: 'row', gap: 10 },
  btnEditarPendente: { backgroundColor: '#F1C40F', padding: 10, borderRadius: 8 },
  btnApagarPendente: { backgroundColor: '#E74C3C', padding: 10, borderRadius: 8 },
  btnAcaoTexto: { fontSize: 16 },
  btnFecharModal: { backgroundColor: '#95A5A6', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  btnFecharTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 14 }
});