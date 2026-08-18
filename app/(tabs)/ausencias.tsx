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

  // ESTADOS PARA OCORRÊNCIAS (Atestado e Novas Licenças)
  const [dataOcorrencia, setDataOcorrencia] = useState('');
  const [diasOcorrencia, setDiasOcorrencia] = useState('');
  const [cidAtestado, setCidAtestado] = useState('');

  // ESTADOS PARA O ABONO
  const [dataAbono, setDataAbono] = useState('');
  const [motivoAbono, setMotivoAbono] = useState('');

  // ESTADO: VALOR DA DIÁRIA (Serve para todos)
  const [valorDiaria, setValorDiaria] = useState('');

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

  const parseEdicao = (item: any) => {
    setColaborador(item.colaborador);
    setValorDiaria(item.valor_unitario ? String(item.valor_unitario).replace('.', ',') : '');

    if (item.servico && item.servico.startsWith('Abono')) {
      setTipoAusencia('Abono');
      setDataAbono(converterParaUI(item.data));
      const match = item.servico.match(/\((.*?)\)/);
      if (match) setMotivoAbono(match[1]);
      else setMotivoAbono('');
    } else {
      setTipoAusencia(item.servico || 'Atestado'); 
      setDataOcorrencia(converterParaUI(item.data_atestado || item.data));
      setDiasOcorrencia(item.dias_atestado ? String(item.dias_atestado) : '');
      setCidAtestado(item.cid_atestado || '');
    }
  };

  const prepararEdicao = (index: number) => {
    parseEdicao(ausenciasPendentes[index]);
    setIndexEdicao(index);
    setIdEdicaoOnline(null);
    setModalPendentesVisivel(false);
  };

  const prepararEdicaoOnline = (item: any) => {
    parseEdicao(item);
    setIdEdicaoOnline(item.id);
    setIndexEdicao(null);
    setModalOnlineVisivel(false);
  };

  const abrirHistoricoOnline = async () => {
    if (isOffline) return Alert.alert("Sem Conexão", "Você precisa de internet para buscar o histórico do banco de dados.");

    setModalOnlineVisivel(true);
    setCarregandoOnline(true);

    try {
      let query = supabase
        .from('diarios_campo')
        .select('*')
        .eq('quantidade', 0)
        .eq('fazenda', '-')
        .order('id', { ascending: false })
        .limit(50);

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

  const cancelarEdicao = () => {
    setIndexEdicao(null);
    setIdEdicaoOnline(null);
    setColaborador('');
    setDataOcorrencia('');
    setDiasOcorrencia('');
    setCidAtestado('');
    setDataAbono('');
    setMotivoAbono('');
    setValorDiaria('');
  };

  const salvarAusencia = async () => {
    if (!colaborador || !tipoAusencia) {
      return Alert.alert("Aviso", "Selecione o colaborador e o tipo de ocorrência!");
    }

    let dataLancamentoBD = null;
    let diasBD = null;
    let cidBD = null;
    let servicoFinal = tipoAusencia;

    if (tipoAusencia === 'Abono') {
      if (!dataAbono || dataAbono.length !== 10) {
        return Alert.alert("Aviso", "Preencha a data do abono corretamente (DD/MM/AAAA)!");
      }
      dataLancamentoBD = converterParaBanco(dataAbono);
      servicoFinal = motivoAbono.trim() ? `Abono (${motivoAbono.trim()})` : 'Abono';
    } 
    else {
      if (!dataOcorrencia || dataOcorrencia.length !== 10 || !diasOcorrencia) {
        return Alert.alert("Aviso", "Preencha a data e a quantidade de dias da ocorrência!");
      }
      if (tipoAusencia === 'Atestado' && !cidAtestado) {
        return Alert.alert("Aviso", "Preencha o código CID do atestado médico!");
      }
      
      dataLancamentoBD = converterParaBanco(dataOcorrencia);
      diasBD = parseInt(diasOcorrencia) || 1;
      cidBD = tipoAusencia === 'Atestado' ? cidAtestado : null;
    }

    let valNum = 0;
    if (valorDiaria) {
      valNum = parseFloat(valorDiaria.replace(',', '.'));
      if (isNaN(valNum)) valNum = 0;
    }
    
    const multiplicadorDias = tipoAusencia === 'Abono' ? 1 : diasBD;
    const valTotal = valNum * (multiplicadorDias || 1);

    setSalvando(true);

    const payload: any = { 
      colaborador: colaborador, 
      servico: servicoFinal,
      fazenda: '-', 
      quadra: '-', 
      ramal: '-', 
      quantidade: 0,
      valor_unitario: valNum,
      valor_total: valTotal,
      data_atestado: tipoAusencia !== 'Abono' ? dataLancamentoBD : null,
      dias_atestado: tipoAusencia !== 'Abono' ? diasBD : null,
      cid_atestado: cidBD,
      fiscal_nome: perfilLogado?.nome || 'Fiscal Não Identificado',
      observacao: 'SISTEMA_NOVO' // 🟢 CARIMBO INVISÍVEL ADICIONADO AQUI
    };

    if (dataLancamentoBD) {
      payload.data = dataLancamentoBD;
    }

    try {
      if (idEdicaoOnline !== null) {
        const { error } = await supabase.from('diarios_campo').update(payload).eq('id', idEdicaoOnline);
        if (error) throw error;
        Alert.alert("✅ Sucesso", "Registro atualizado diretamente no banco de dados!");
        cancelarEdicao();
        setSalvando(false);
        return;
      }

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

  const sincronizarComBanco = async () => {
    if (ausenciasPendentes.length === 0) return;
    setSincronizando(true);

    try {
      const { error } = await supabase.from('diarios_campo').insert(ausenciasPendentes);
      if (error) throw error;

      await AsyncStorage.removeItem('@ausencias_off');
      setAusenciasPendentes([]);
      Alert.alert("🚀 Sincronizado com Sucesso!", "Todos os registros foram enviados.");
    } catch (e: any) {
      Alert.alert("Erro na Sincronização", "Envio interrompido: " + e.message);
    } finally {
      setSincronizando(false);
    }
  };

  const excluirPendente = async (index: number) => {
    Alert.alert(
      "Excluir Registro",
      "Tem certeza que deseja apagar este registro do celular?",
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
            <Text style={styles.subtitle}>Lançamento de Ocorrências e Faltas</Text>
          </View>

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
                <View style={[styles.pickerContainer, { height: 60 }]}>
                  <Picker selectedValue={tipoAusencia} onValueChange={setTipoAusencia} style={styles.picker}>
                    <Picker.Item label="Atestado Médico" value="Atestado" />
                    <Picker.Item label="Abono" value="Abono" />
                    <Picker.Item label="Declaração" value="Declaração" />
                    <Picker.Item label="Declaração de Comparecimento" value="Declaração de Comparecimento" />
                    <Picker.Item label="Declaração de Horas" value="Declaração de Horas" />
                    <Picker.Item label="Afastamento" value="Afastamento" />
                    <Picker.Item label="Licença Nojo (Óbito)" value="Licença Nojo" />
                    <Picker.Item label="Licença Gala (Casamento)" value="Licença Gala" />
                    <Picker.Item label="Licença Maternidade" value="Licença Maternidade" />
                    <Picker.Item label="Licença Paternidade" value="Licença Paternidade" />
                  </Picker>
                </View>

                {tipoAusencia !== 'Abono' && (
                  <View style={styles.atestadoBox}>
                    <Text style={styles.atestadoTitulo}>
                      {tipoAusencia === 'Atestado' ? 'Detalhes do Atestado 🏥' : 'Detalhes da Ocorrência 📝'}
                    </Text>

                    <Text style={styles.label}>Data do Documento:</Text>
                    <TextInput 
                      style={styles.input} 
                      placeholder="DD/MM/AAAA" 
                      keyboardType="numeric"
                      maxLength={10}
                      value={dataOcorrencia} 
                      onChangeText={(t) => setDataOcorrencia(aplicarMascaraData(t))} 
                    />

                    <View style={styles.row}>
                      <View style={styles.col}>
                        <Text style={styles.label}>Qtd. de Dias:</Text>
                        <TextInput 
                          style={styles.input} 
                          placeholder="Ex: 3" 
                          keyboardType="numeric" 
                          value={diasOcorrencia} 
                          onChangeText={setDiasOcorrencia} 
                        />
                      </View>
                      <View style={styles.col}>
                        <Text style={styles.label}>Valor da Diária (R$):</Text>
                        <TextInput 
                          style={styles.input} 
                          placeholder="Ex: 61,51 (Ou vazio)" 
                          keyboardType="numeric" 
                          value={valorDiaria} 
                          onChangeText={setValorDiaria} 
                        />
                      </View>
                    </View>
                    
                    {tipoAusencia === 'Atestado' && (
                      <View style={{marginTop: 5}}>
                        <Text style={styles.label}>Código CID:</Text>
                        <TextInput 
                          style={styles.input} 
                          placeholder="Ex: J01.9" 
                          value={cidAtestado} 
                          onChangeText={setCidAtestado} 
                          autoCapitalize="characters"
                        />
                      </View>
                    )}
                  </View>
                )}

                {tipoAusencia === 'Abono' && (
                  <View style={styles.abonoBox}>
                    <Text style={styles.abonoTitulo}>Detalhes do Abono ✅</Text>

                    <Text style={styles.label}>Data da Ausência:</Text>
                    <TextInput 
                      style={styles.input} 
                      placeholder="DD/MM/AAAA" 
                      keyboardType="numeric"
                      maxLength={10}
                      value={dataAbono} 
                      onChangeText={(t) => setDataAbono(aplicarMascaraData(t))} 
                    />

                    <View style={styles.row}>
                      <View style={styles.col}>
                        <Text style={styles.label}>Motivo (Opcional):</Text>
                        <TextInput 
                          style={styles.input} 
                          placeholder="Ex: Doação de sangue..." 
                          value={motivoAbono} 
                          onChangeText={setMotivoAbono} 
                        />
                      </View>
                      <View style={styles.col}>
                        <Text style={styles.label}>Valor (R$):</Text>
                        <TextInput 
                          style={styles.input} 
                          placeholder="Ex: 61,51" 
                          keyboardType="numeric" 
                          value={valorDiaria} 
                          onChangeText={setValorDiaria} 
                        />
                      </View>
                    </View>
                  </View>
                )}

                <View style={[styles.avisoBox, tipoAusencia === 'Abono' ? styles.avisoAbono : styles.avisoAtestado]}>
                  <Text style={styles.avisoTexto}>
                    O valor financeiro lançado no banco será R$ {valorDiaria || '0,00'} por dia. (Total ajustado automaticamente).
                  </Text>
                </View>

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
                    style={[styles.button, salvando ? styles.buttonDisabled : null, tipoAusencia === 'Abono' ? styles.btnAbono : styles.btnAtestado]} 
                    onPress={salvarAusencia} 
                    disabled={salvando}
                  >
                    {salvando ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.buttonText}>Salvar Registro no Aparelho</Text>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.buttonAtualizar} onPress={() => carregarDadosBase(perfilLogado)}>
                  <Text style={styles.buttonAtualizarText}>↻ Recarregar Equipe</Text>
                </TouchableOpacity>

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

        <Modal visible={modalPendentesVisivel} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContentGrande}>
              <Text style={styles.modalTitle}>Ocorrências Pendentes</Text>
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
                          {!item.cid_atestado && item.dias_atestado && <Text style={styles.itemDetalhes}>Duração: {item.dias_atestado} dias</Text>}
                          <Text style={{fontSize: 12, color: '#27AE60', fontWeight: 'bold', marginTop: 2}}>
                            Valor Pago: R$ {item.valor_total.toFixed(2).replace('.', ',')}
                          </Text>
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
                            {!item.cid_atestado && item.dias_atestado && <Text style={styles.itemDetalhes}>Duração: {item.dias_atestado} dias</Text>}
                            <Text style={{fontSize: 12, color: '#27AE60', fontWeight: 'bold', marginTop: 2}}>
                              Valor Pago: R$ {(item.valor_total || 0).toFixed(2).replace('.', ',')}
                            </Text>
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
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', overflow: 'hidden', justifyContent: 'center' },
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

  edicaoAviso: { backgroundColor: '#FCF3CF', padding: 10, borderRadius: 8, marginBottom: 15, alignItems: 'center' },
  edicaoAvisoTexto: { color: '#D35400', fontWeight: 'bold', fontSize: 12 },
  rowBotoesEdicao: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25 },
  btnCancelarEdicao: { flex: 1, marginRight: 10, backgroundColor: '#E74C3C', marginTop: 0 },
  btnSalvarEdicao: { flex: 1, backgroundColor: '#27AE60', marginTop: 0 },

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