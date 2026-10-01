import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

export default function ColaboradoresScreen() {
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [listaSetores, setListaSetores] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Estados de Filtro e Busca na Tela Principal
  const [abaStatus, setAbaStatus] = useState<'ATIVOS' | 'DEMITIDOS' | 'TODOS'>('ATIVOS');
  const [busca, setBusca] = useState('');

  // Estados do Modal de Cadastro/Edição
  const [modalVisivel, setModalVisivel] = useState(false);
  const [nome, setNome] = useState('');
  const [setor, setSetor] = useState(''); 
  const [dataAdmissao, setDataAdmissao] = useState('');
  const [dataDemissao, setDataDemissao] = useState(''); // NOVO: Estado da Data de Demissão
  const [salvando, setSalvando] = useState(false);
  
  // Controle de edição
  const [editandoColaboradorId, setEditandoColaboradorId] = useState<number | null>(null);

  useEffect(() => {
    carregarDadosBase();
  }, []);

  const carregarDadosBase = async () => {
    setCarregando(true);
    
    // Carrega Colaboradores
    const { data: dataColabs } = await supabase.from('colaboradores').select('*').order('nome', { ascending: true });
    if (dataColabs) {
      setColaboradores(dataColabs);
      // Envia para a mochila offline APENAS os colaboradores ativos (sem data de demissão)
      const apenasAtivos = dataColabs.filter(c => !c.data_demissao);
      await AsyncStorage.setItem('@mochila_colaboradores', JSON.stringify(apenasAtivos));
    }

    // Carrega Setores para o Picker
    const { data: dataSetores } = await supabase.from('setores').select('*').order('nome', { ascending: true });
    if (dataSetores) {
      setListaSetores(dataSetores);
    }
    
    setCarregando(false);
  };

  // MÁSCARA DE DATA (01/01/2026)
  const aplicarMascaraData = (texto: string) => {
    let v = texto.replace(/\D/g, ''); 
    if (v.length > 8) v = v.substring(0, 8); 
    if (v.length > 4) v = v.replace(/^(\d{2})(\d{2})(\d{1,4}).*/, '$1/$2/$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{1,2}).*/, '$1/$2');
    return v;
  };

  // Converte de DD/MM/AAAA para AAAA-MM-DD
  const converterParaBanco = (dataBR: string) => {
    if (!dataBR || dataBR.trim() === '') return null;
    const partes = dataBR.split('/');
    if (partes.length === 3) return `${partes[2]}-${partes[1]}-${partes[0]}`;
    return null;
  };

  // Converte de AAAA-MM-DD para DD/MM/AAAA (para a tela de edição)
  const converterParaTela = (dataBD: string | null) => {
    if (!dataBD) return '';
    const partes = dataBD.split('-');
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return dataBD;
  };

  const preencherHojeDemissao = () => {
    const hoje = new Date();
    const dia = String(hoje.getDate()).padStart(2, '0');
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const ano = hoje.getFullYear();
    setDataDemissao(`${dia}/${mes}/${ano}`);
  };

  const abrirModalNovo = () => {
    setEditandoColaboradorId(null);
    setNome('');
    setDataAdmissao('');
    setDataDemissao('');
    setSetor('');
    setModalVisivel(true);
  };

  const iniciarEdicao = (item: any) => {
    setEditandoColaboradorId(item.id);
    setNome(item.nome);
    setDataAdmissao(converterParaTela(item.data_admissao));
    setDataDemissao(converterParaTela(item.data_demissao));
    setSetor(item.setor);
    setModalVisivel(true);
  };

  const salvarColaborador = async () => {
    if (!nome || !dataAdmissao || !setor) {
      return Alert.alert("Aviso", "Preencha Nome, Setor e Data de Admissão!");
    }
    if (dataAdmissao.length !== 10) {
      return Alert.alert("Aviso", "Data de admissão incompleta (Use DD/MM/AAAA)!");
    }
    if (dataDemissao.trim() !== '' && dataDemissao.length !== 10) {
      return Alert.alert("Aviso", "Data de demissão incompleta! Preencha DD/MM/AAAA ou deixe o campo totalmente vazio.");
    }

    setSalvando(true);
    const dataAdmissaoFormatada = converterParaBanco(dataAdmissao);
    const dataDemissaoFormatada = dataDemissao.trim() !== '' ? converterParaBanco(dataDemissao) : null;

    const payload = {
      nome: nome.trim().toUpperCase(),
      setor: setor,
      data_admissao: dataAdmissaoFormatada,
      data_demissao: dataDemissaoFormatada
    };

    let error;

    if (editandoColaboradorId) {
      // ATUALIZAR
      const { error: errUpdate } = await supabase.from('colaboradores').update(payload).eq('id', editandoColaboradorId);
      error = errUpdate;
    } else {
      // INSERIR
      const { error: errInsert } = await supabase.from('colaboradores').insert([payload]);
      error = errInsert;
    }

    setSalvando(false);
    
    if (error) {
      Alert.alert("Erro", "Falha ao salvar: " + error.message);
    } else {
      Alert.alert("Sucesso", editandoColaboradorId ? "Dados do colaborador atualizados!" : "Colaborador cadastrado na equipe!");
      setModalVisivel(false);
      carregarDadosBase(); // Recarrega a lista e atualiza a mochila
    }
  };

  const executarExclusao = async (id: number) => {
    setCarregando(true);
    const { error } = await supabase.from('colaboradores').delete().eq('id', id);
    if (error) {
      Alert.alert("Erro", "Não foi possível excluir: " + error.message);
      setCarregando(false);
    } else {
      carregarDadosBase();
    }
  };

  const excluirColaborador = (id: number, nomeColab: string) => {
    if (Platform.OS === 'web') {
      const confirmar = (globalThis as any).confirm?.(`Deseja realmente apagar o colaborador "${nomeColab}"?`);
      if (confirmar) executarExclusao(id);
    } else {
      Alert.alert('Excluir', `Deseja realmente apagar o colaborador "${nomeColab}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sim, Apagar', style: 'destructive', onPress: () => executarExclusao(id) }
      ]);
    }
  };

  // Contadores e Lista Filtrada
  const contadores = useMemo(() => {
    const ativos = colaboradores.filter(c => !c.data_demissao).length;
    const demitidos = colaboradores.filter(c => !!c.data_demissao).length;
    return { ativos, demitidos, todos: colaboradores.length };
  }, [colaboradores]);

  const colaboradoresFiltrados = useMemo(() => {
    return colaboradores.filter((item) => {
      // 1. Filtro da Aba (Ativos / Demitidos / Todos)
      if (abaStatus === 'ATIVOS' && item.data_demissao) return false;
      if (abaStatus === 'DEMITIDOS' && !item.data_demissao) return false;

      // 2. Filtro de Busca por Nome ou Setor
      if (busca.trim() !== '') {
        const termo = busca.trim().toLowerCase();
        const matchNome = (item.nome || '').toLowerCase().includes(termo);
        const matchSetor = (item.setor || '').toLowerCase().includes(termo);
        return matchNome || matchSetor;
      }

      return true;
    });
  }, [colaboradores, abaStatus, busca]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Gestão de Equipe 🧑‍🌾</Text>
        <Text style={styles.subtitle}>
          {contadores.ativos} ativos  •  {contadores.demitidos} desligados
        </Text>
      </View>

      <TouchableOpacity style={styles.btnNovo} onPress={abrirModalNovo}>
        <Text style={styles.btnNovoTexto}>➕ CADASTRAR FUNCIONÁRIO</Text>
      </TouchableOpacity>

      {/* BARRA DE PESQUISA E ABAS DE STATUS */}
      <View style={styles.painelFiltros}>
        <TextInput
          style={styles.inputBusca}
          placeholder="🔍 Buscar funcionário por nome ou setor..."
          placeholderTextColor="#95A5A6"
          value={busca}
          onChangeText={setBusca}
        />

        <View style={styles.abasRow}>
          <TouchableOpacity
            style={[styles.abaBtn, abaStatus === 'ATIVOS' && styles.abaBtnAtivoVerde]}
            onPress={() => setAbaStatus('ATIVOS')}
          >
            <Text style={[styles.abaTexto, abaStatus === 'ATIVOS' && styles.abaTextoSelecionado]}>
              🟢 Ativos ({contadores.ativos})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.abaBtn, abaStatus === 'DEMITIDOS' && styles.abaBtnAtivoVermelho]}
            onPress={() => setAbaStatus('DEMITIDOS')}
          >
            <Text style={[styles.abaTexto, abaStatus === 'DEMITIDOS' && styles.abaTextoSelecionado]}>
              🔴 Demitidos ({contadores.demitidos})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.abaBtn, abaStatus === 'TODOS' && styles.abaBtnAtivoAzul]}
            onPress={() => setAbaStatus('TODOS')}
          >
            <Text style={[styles.abaTexto, abaStatus === 'TODOS' && styles.abaTextoSelecionado]}>
              📋 Todos ({contadores.todos})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {carregando ? (
        <ActivityIndicator size="large" color="#27AE60" style={{ marginTop: 50 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.lista}>
          {colaboradoresFiltrados.length === 0 ? (
            <Text style={styles.textoVazio}>Nenhum funcionário encontrado nesta lista.</Text>
          ) : (
            colaboradoresFiltrados.map((item) => {
              const isDemitido = !!item.data_demissao;

              return (
                <View
                  key={item.id}
                  style={[styles.cardColab, isDemitido && styles.cardColabDemitido]}
                >
                  <View style={styles.infoColab}>
                    <View style={styles.topoCardRow}>
                      <Text style={[styles.nomeColab, isDemitido && styles.nomeColabDemitido]}>
                        {item.nome}
                      </Text>
                      <View style={[styles.statusTag, isDemitido ? styles.statusTagDemitido : styles.statusTagAtivo]}>
                        <Text style={[styles.statusTagTexto, isDemitido ? { color: '#C0392B' } : { color: '#1E8449' }]}>
                          {isDemitido ? 'DEMITIDO' : 'ATIVO'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.linhaDetalhe}>
                      <Text style={styles.detalheBadge}>🛠️ {item.setor || 'Não definido'}</Text>
                      <Text style={styles.detalheData}>
                        📅 Admissão: {item.data_admissao ? converterParaTela(item.data_admissao) : '--/--/----'}
                      </Text>
                    </View>

                    {/* SE TIVER DATA DE DEMISSÃO, MOSTRA EM DESTAQUE */}
                    {isDemitido && (
                      <View style={styles.boxDataDemissaoCard}>
                        <Text style={styles.textoDataDemissaoCard}>
                          🚪 Data de Demissão: {converterParaTela(item.data_demissao)}
                        </Text>
                      </View>
                    )}
                  </View>
                  
                  {/* BOTÕES DE AÇÃO: EDITAR E EXCLUIR */}
                  <View style={styles.boxAcoes}>
                    <TouchableOpacity style={styles.btnAcao} onPress={() => iniciarEdicao(item)}>
                      <Text style={styles.iconeAcao}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btnAcao} onPress={() => excluirColaborador(item.id, item.nome)}>
                      <Text style={styles.iconeAcao}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* MODAL DE CADASTRO / EDIÇÃO */}
      <Modal visible={modalVisivel} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editandoColaboradorId ? '✏️ Editar Colaborador' : 'Novo Colaborador'}
            </Text>

            <Text style={styles.label}>Nome Completo:</Text>
            <TextInput 
              style={styles.input} 
              value={nome} 
              onChangeText={setNome} 
              placeholder="Ex: JOÃO DA SILVA"
              autoCapitalize="characters"
            />

            <Text style={styles.label}>Setor de Trabalho:</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={setor} onValueChange={setSetor}>
                <Picker.Item label="Selecione o setor..." value="" />
                {listaSetores.map((s, index) => (
                   <Picker.Item key={index} label={s.nome} value={s.nome} />
                ))}
              </Picker>
            </View>
            {listaSetores.length === 0 && (
               <Text style={{fontSize: 10, color: '#E74C3C', marginTop: 5}}>
                 Nenhum setor cadastrado. Vá no Painel Admin para criar setores.
               </Text>
            )}

            <Text style={styles.label}>Data de Admissão:</Text>
            <TextInput 
              style={styles.input} 
              value={dataAdmissao} 
              onChangeText={(text) => setDataAdmissao(aplicarMascaraData(text))} 
              placeholder="DD/MM/AAAA"
              keyboardType="numeric"
              maxLength={10}
            />

            {/* SEÇÃO DE DATA DE DEMISSÃO */}
            <View style={styles.secaoDemissao}>
              <View style={styles.headerDemissaoRow}>
                <Text style={styles.labelDemissao}>🚪 Data de Demissão (Opcional):</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={styles.btnAtalhoHoje} onPress={preencherHojeDemissao}>
                    <Text style={styles.btnAtalhoHojeTexto}>Hoje</Text>
                  </TouchableOpacity>
                  {dataDemissao !== '' && (
                    <TouchableOpacity style={styles.btnLimparDemissao} onPress={() => setDataDemissao('')}>
                      <Text style={styles.btnLimparDemissaoTexto}>Reativar / Limpar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <TextInput 
                style={[styles.input, dataDemissao !== '' && styles.inputDemissaoPreenchido]} 
                value={dataDemissao} 
                onChangeText={(text) => setDataDemissao(aplicarMascaraData(text))} 
                placeholder="Deixe em branco se estiver ativo (DD/MM/AAAA)"
                placeholderTextColor="#95A5A6"
                keyboardType="numeric"
                maxLength={10}
              />
              <Text style={styles.dicaDemissao}>
                {dataDemissao !== '' 
                  ? '⚠️ Ao salvar com data de demissão, este colaborador ficará como DEMITIDO.' 
                  : '✅ Sem data preenchida: o colaborador permanece ATIVO na equipe.'}
              </Text>
            </View>

            <View style={styles.modalBotoes}>
              <TouchableOpacity style={styles.btnCancelar} onPress={() => setModalVisivel(false)}>
                <Text style={styles.btnCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btnSalvar} onPress={salvarColaborador} disabled={salvando}>
                {salvando ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.btnSalvarTexto}>{editandoColaboradorId ? 'Atualizar' : 'Salvar'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { marginTop: 45, marginBottom: 15, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 14, color: '#7F8C8D', marginTop: 4, fontWeight: '600' },
  
  btnNovo: { backgroundColor: '#27AE60', marginHorizontal: 20, padding: 15, borderRadius: 8, alignItems: 'center', elevation: 2 },
  btnNovoTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },

  painelFiltros: { marginHorizontal: 20, marginTop: 12 },
  inputBusca: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D5DBDB', borderRadius: 8, paddingHorizontal: 12, height: 44, fontSize: 14, color: '#2C3E50', marginBottom: 10 },
  abasRow: { flexDirection: 'row', gap: 8 },
  abaBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#ECF0F1', alignItems: 'center', borderWidth: 1, borderColor: '#D5DBDB' },
  abaBtnAtivoVerde: { backgroundColor: '#27AE60', borderColor: '#1E8449' },
  abaBtnAtivoVermelho: { backgroundColor: '#E74C3C', borderColor: '#C0392B' },
  abaBtnAtivoAzul: { backgroundColor: '#2C3E50', borderColor: '#1A252F' },
  abaTexto: { fontSize: 12, fontWeight: 'bold', color: '#5D6D7E' },
  abaTextoSelecionado: { color: '#FFF' },

  lista: { padding: 20, paddingBottom: 100 },
  textoVazio: { textAlign: 'center', color: '#95A5A6', marginTop: 30 },
  
  cardColab: { flexDirection: 'row', backgroundColor: '#FFF', padding: 15, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#E0E6ED', elevation: 1 },
  cardColabDemitido: { backgroundColor: '#FFFDFD', borderColor: '#F5B7B1', borderWidth: 1.5 },
  infoColab: { flex: 1, justifyContent: 'center', paddingRight: 8 },
  
  topoCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  nomeColab: { fontSize: 16, fontWeight: 'bold', color: '#2C3E50', flex: 1, marginRight: 8 },
  nomeColabDemitido: { color: '#7F8C8D', textDecorationLine: 'line-through' },

  statusTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusTagAtivo: { backgroundColor: '#E8F8F5' },
  statusTagDemitido: { backgroundColor: '#FDEDEC' },
  statusTagTexto: { fontSize: 10, fontWeight: 'bold' },

  linhaDetalhe: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  detalheBadge: { backgroundColor: '#EBF5FB', color: '#2980B9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, fontSize: 11, fontWeight: 'bold' },
  detalheData: { fontSize: 12, color: '#7F8C8D' },

  boxDataDemissaoCard: { marginTop: 8, backgroundColor: '#FDEDEC', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, alignSelf: 'flex-start' },
  textoDataDemissaoCard: { fontSize: 11, fontWeight: 'bold', color: '#C0392B' },

  boxAcoes: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: '#F0F3F4' },
  btnAcao: { padding: 8 },
  iconeAcao: { fontSize: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', padding: 20, borderRadius: 15, elevation: 10, maxWidth: 500, width: '100%', alignSelf: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E50', marginBottom: 15, textAlign: 'center' },
  
  label: { fontSize: 13, fontWeight: 'bold', color: '#34495E', marginBottom: 5, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#D5DBDB', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#F9F9F9', color: '#2C3E50' },
  pickerContainer: { borderWidth: 1, borderColor: '#D5DBDB', borderRadius: 8, backgroundColor: '#F9F9F9' },

  secaoDemissao: { marginTop: 16, padding: 12, backgroundColor: '#FDF2E9', borderRadius: 10, borderWidth: 1, borderColor: '#F5CBA7' },
  headerDemissaoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  labelDemissao: { fontSize: 13, fontWeight: 'bold', color: '#C0392B' },
  btnAtalhoHoje: { backgroundColor: '#E67E22', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  btnAtalhoHojeTexto: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  btnLimparDemissao: { backgroundColor: '#27AE60', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  btnLimparDemissaoTexto: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  inputDemissaoPreenchido: { borderColor: '#E74C3C', backgroundColor: '#FDEDEC', fontWeight: 'bold', color: '#C0392B' },
  dicaDemissao: { fontSize: 11, color: '#7F8C8D', marginTop: 6 },
  
  modalBotoes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25 },
  btnCancelar: { flex: 1, backgroundColor: '#ECF0F1', padding: 15, borderRadius: 8, alignItems: 'center', marginRight: 10 },
  btnCancelarTexto: { color: '#7F8C8D', fontWeight: 'bold' },
  btnSalvar: { flex: 1, backgroundColor: '#3498DB', padding: 15, borderRadius: 8, alignItems: 'center', marginLeft: 10 },
  btnSalvarTexto: { color: '#FFF', fontWeight: 'bold' }
});