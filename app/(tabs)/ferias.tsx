import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

export default function FeriasScreen() {
  const [abaAtiva, setAbaAtiva] = useState<'lancar' | 'monitorar'>('lancar');

  const [colaborador, setColaborador] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  
  // Estado para controlar se estamos editando um registro existente
  const [idEditando, setIdEditando] = useState<string | null>(null);

  const [listaColaboradores, setListaColaboradores] = useState<any[]>([]);
  const [feriasPendentes, setFeriasPendentes] = useState<any[]>([]);
  const [todasFeriasBanco, setTodasFeriasBanco] = useState<any[]>([]);
  
  const [salvando, setSalvando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [carregandoMonitoramento, setCarregandoMonitoramento] = useState(false);

  useEffect(() => {
    carregarDados();
    buscarFeriasDaNuvem();
  }, []);

  const carregarDados = async () => {
    const mochila = await AsyncStorage.getItem('@mochila_colaboradores');
    if (mochila) setListaColaboradores(JSON.parse(mochila));

    const pendentes = await AsyncStorage.getItem('@ferias_off');
    if (pendentes) setFeriasPendentes(JSON.parse(pendentes));
  };

  const buscarFeriasDaNuvem = async () => {
    setCarregandoMonitoramento(true);
    try {
      const { data, error } = await supabase.from('ferias').select('*');
      if (error) throw error;
      if (data) setTodasFeriasBanco(data);
    } catch (e) {
      console.log("Erro ao buscar histórico de férias para monitoramento", e);
    } finally {
      setCarregandoMonitoramento(false);
    }
  };

  // === MÁSCARA AUTOMÁTICA (Coloca as barras sozinho) ===
  const aplicarMascaraData = (texto: string) => {
    let v = texto.replace(/\D/g, ''); 
    if (v.length > 8) v = v.substring(0, 8); 
    
    if (v.length > 4) {
      v = v.replace(/^(\d{2})(\d{2})(\d{1,4}).*/, '$1/$2/$3');
    } else if (v.length > 2) {
      v = v.replace(/^(\d{2})(\d{1,2}).*/, '$1/$2');
    }
    return v;
  };

  const handleDataInicio = (texto: string) => setDataInicio(aplicarMascaraData(texto));
  const handleDataFim = (texto: string) => setDataFim(aplicarMascaraData(texto));

  // === CONVERSORES DE DATA ===
  const converterParaBanco = (dataBR: string) => {
    const partes = dataBR.split('/');
    if (partes.length === 3) {
      return `${partes[2]}-${partes[1]}-${partes[0]}`; // Vira AAAA-MM-DD
    }
    return null;
  };

  const formatarDataBR = (dataISO: string) => {
    if (!dataISO) return '';
    const partes = dataISO.split('-');
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return dataISO;
  };

  // === FLUXO DE SALVAR (NOVO) ===
  const salvarLocalmente = async () => {
    if (!colaborador || !dataInicio || !dataFim) {
      return Alert.alert("Aviso", "Preencha todos os campos!");
    }
    if (dataInicio.length !== 10 || dataFim.length !== 10) {
      return Alert.alert("Aviso", "A data precisa estar completa! Ex: 01/05/2026");
    }

    const dataInicioBD = converterParaBanco(dataInicio);
    const dataFimBD = converterParaBanco(dataFim);

    setSalvando(true);
    const novoRegistro = { 
      colaborador_nome: colaborador, 
      data_inicio: dataInicioBD, 
      data_fim: dataFimBD 
    };

    try {
      const novaLista = [...feriasPendentes, novoRegistro];
      await AsyncStorage.setItem('@ferias_off', JSON.stringify(novaLista));
      setFeriasPendentes(novaLista);
      
      Alert.alert("✅ Salvo Offline", "Período guardado! Não se esqueça de clicar em Enviar para o Banco.");
      limparFormulario();
    } catch (e) {
      Alert.alert("Erro", "Falha ao guardar dados no aparelho.");
    } finally {
      setSalvando(false);
    }
  };

  const enviarParaNuvem = async () => {
    if (feriasPendentes.length === 0) return;
    setSincronizando(true);

    try {
      const { error } = await supabase.from('ferias').insert(feriasPendentes);
      if (error) throw error; 

      await AsyncStorage.removeItem('@ferias_off');
      setFeriasPendentes([]);
      Alert.alert("🚀 Sincronizado!", "As férias foram enviadas para o sistema central.");
      buscarFeriasDaNuvem(); 
    } catch (e: any) {
      Alert.alert("Falha no Envio do Banco", e.message);
    } finally {
      setSincronizando(false);
    }
  };

  // === FLUXO DE EDIÇÃO E EXCLUSÃO (ADMIN) ===
  const prepararEdicao = (item: any) => {
    setIdEditando(item.id);
    setColaborador(item.colaborador_nome);
    setDataInicio(formatarDataBR(item.data_inicio));
    setDataFim(formatarDataBR(item.data_fim));
    setAbaAtiva('lancar');
  };

  const cancelarEdicao = () => {
    limparFormulario();
  };

  const limparFormulario = () => {
    setIdEditando(null);
    setColaborador('');
    setDataInicio('');
    setDataFim('');
  };

  const atualizarNoBanco = async () => {
    if (!colaborador || !dataInicio || !dataFim) {
      return Alert.alert("Aviso", "Preencha todos os campos!");
    }
    if (dataInicio.length !== 10 || dataFim.length !== 10) {
      return Alert.alert("Aviso", "A data precisa estar completa! Ex: 01/05/2026");
    }

    setSalvando(true);
    try {
      const { error } = await supabase
        .from('ferias')
        .update({
          colaborador_nome: colaborador,
          data_inicio: converterParaBanco(dataInicio),
          data_fim: converterParaBanco(dataFim)
        })
        .eq('id', idEditando);

      if (error) throw error;

      Alert.alert("✅ Atualizado", "As férias foram atualizadas com sucesso!");
      limparFormulario();
      setAbaAtiva('monitorar');
      buscarFeriasDaNuvem();
    } catch (e: any) {
      Alert.alert("Erro ao atualizar", e.message);
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = (id: string, nome: string) => {
    Alert.alert(
      "Excluir Férias",
      `Tem certeza que deseja excluir as férias de ${nome}?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Excluir", style: "destructive", onPress: () => excluirDoBanco(id) }
      ]
    );
  };

  const excluirDoBanco = async (id: string) => {
    try {
      setCarregandoMonitoramento(true);
      const { error } = await supabase.from('ferias').delete().eq('id', id);
      if (error) throw error;
      
      Alert.alert("🗑️ Excluído", "Registro removido com sucesso.");
      buscarFeriasDaNuvem();
    } catch (e: any) {
      Alert.alert("Erro ao excluir", e.message);
      setCarregandoMonitoramento(false);
    }
  };


  // Lógica para separar férias nas categorias
  const hojeStr = new Date().toISOString().split('T')[0];
  
  const emFeriasAgora = todasFeriasBanco.filter(item => item.data_inicio <= hojeStr && item.data_fim >= hojeStr);
  const feriasFuturas = todasFeriasBanco.filter(item => item.data_inicio > hojeStr);
  const feriasPassadas = todasFeriasBanco.filter(item => item.data_fim < hojeStr);

  // Componente interno para renderizar cada cartão e evitar repetição de código
  const RenderMonitorCard = ({ item, color }: { item: any, color: string }) => (
    <View style={[styles.monitorCard, { borderLeftColor: color }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.monitorNome}>{item.colaborador_nome}</Text>
        <Text style={styles.monitorDatas}>De: {formatarDataBR(item.data_inicio)} até {formatarDataBR(item.data_fim)}</Text>
      </View>
      
      {/* Botões de Ação (Apenas para o Administrador) */}
      <View style={styles.actionButtonsContainer}>
        <TouchableOpacity onPress={() => prepararEdicao(item)} style={styles.actionBtn}>
          <Text style={{ fontSize: 18 }}>✏️</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => confirmarExclusao(item.id, item.colaborador_nome)} style={styles.actionBtn}>
          <Text style={{ fontSize: 18 }}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 50 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Gestão de Férias 🏖️</Text>
      <Text style={styles.subtitle}>Controle de períodos de descanso e afastamentos programados.</Text>

      {/* ABAS DE NAVEGAÇÃO */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, abaAtiva === 'lancar' && styles.tabButtonActive]} 
          onPress={() => setAbaAtiva('lancar')}
        >
          <Text style={[styles.tabText, abaAtiva === 'lancar' && styles.tabTextActive]}>
            {idEditando ? '✏️ Editando Férias' : 'Lançar Férias'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabButton, abaAtiva === 'monitorar' && styles.tabButtonActive]} 
          onPress={() => {
            cancelarEdicao(); // Limpa a edição se ele mudar de aba sem salvar
            setAbaAtiva('monitorar');
            buscarFeriasDaNuvem();
          }}
        >
          <Text style={[styles.tabText, abaAtiva === 'monitorar' && styles.tabTextActive]}>Monitorar Férias</Text>
        </TouchableOpacity>
      </View>

      {/* CONTEÚDO DA ABA: LANÇAR / EDITAR */}
      {abaAtiva === 'lancar' && (
        <View>
          {/* CARTÃO DE SINCRONIZAÇÃO (Esconde se estiver editando) */}
          {feriasPendentes.length > 0 && !idEditando && (
            <View style={styles.syncCard}>
              <Text style={styles.syncTexto}>📦 {feriasPendentes.length} registos aguardando envio</Text>
              <TouchableOpacity style={styles.btnSync} onPress={enviarParaNuvem} disabled={sincronizando}>
                {sincronizando ? <ActivityIndicator color="#F39C12" /> : <Text style={styles.btnSyncTexto}>ENVIAR PARA O BANCO</Text>}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.card}>
            {idEditando && <Text style={styles.editWarning}>Modo de Edição Ativo</Text>}

            <Text style={styles.label}>Colaborador:</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={colaborador} onValueChange={setColaborador}>
                <Picker.Item label="Quem vai tirar férias?" value="" />
                {listaColaboradores.map((c, i) => (
                  <Picker.Item key={i} label={c.nome} value={c.nome} />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>Data Inicial:</Text>
            <TextInput 
              style={styles.input} 
              value={dataInicio} 
              onChangeText={handleDataInicio} 
              placeholder="Ex: 01/05/2026"
              keyboardType="numeric"
              maxLength={10}
            />

            <Text style={styles.label}>Data Final:</Text>
            <TextInput 
              style={styles.input} 
              value={dataFim} 
              onChangeText={handleDataFim} 
              placeholder="Ex: 30/05/2026"
              keyboardType="numeric"
              maxLength={10}
            />

            {/* TROCA OS BOTÕES DEPENDENDO SE É UM NOVO REGISTRO OU UMA EDIÇÃO */}
            {idEditando ? (
              <View style={styles.editButtonsContainer}>
                <TouchableOpacity style={[styles.button, styles.btnCancelar]} onPress={cancelarEdicao}>
                  <Text style={styles.buttonText}>CANCELAR</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, styles.btnAtualizar]} onPress={atualizarNoBanco} disabled={salvando}>
                  {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>ATUALIZAR FÉRIAS</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.button} onPress={salvarLocalmente} disabled={salvando}>
                {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>💾 SALVAR PARA ENVIO</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* CONTEÚDO DA ABA: MONITORAR */}
      {abaAtiva === 'monitorar' && (
        <View>
          {carregandoMonitoramento ? (
            <ActivityIndicator size="large" color="#3498DB" style={{ marginTop: 40 }} />
          ) : (
            <View>
              {/* QUEM ESTÁ EM FÉRIAS HOJE */}
              <Text style={styles.sectionHeader}>🟢 Em Férias Atualmente ({emFeriasAgora.length})</Text>
              {emFeriasAgora.length === 0 ? (
                <Text style={styles.emptyText}>Nenhum funcionário em férias hoje.</Text>
              ) : (
                emFeriasAgora.map((item, index) => <RenderMonitorCard key={index} item={item} color="#27AE60" />)
              )}

              {/* PRÓXIMAS FÉRIAS */}
              <Text style={styles.sectionHeader}>⏳ Próximas Férias / Futuras ({feriasFuturas.length})</Text>
              {feriasFuturas.length === 0 ? (
                <Text style={styles.emptyText}>Nenhum período futuro cadastrado.</Text>
              ) : (
                feriasFuturas.map((item, index) => <RenderMonitorCard key={index} item={item} color="#F39C12" />)
              )}

              {/* FÉRIAS JÁ CONCLUÍDAS */}
              <Text style={styles.sectionHeader}>📁 Histórico de Férias Concluídas ({feriasPassadas.length})</Text>
              {feriasPassadas.length === 0 ? (
                <Text style={styles.emptyText}>Nenhum histórico anterior encontrado.</Text>
              ) : (
                feriasPassadas.map((item, index) => <RenderMonitorCard key={index} item={item} color="#95A5A6" />)
              )}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2C3E50', marginTop: 40 },
  subtitle: { fontSize: 14, color: '#7F8C8D', marginBottom: 20 },
  
  tabContainer: { flexDirection: 'row', backgroundColor: '#E2E8F0', borderRadius: 10, padding: 4, marginBottom: 20 },
  tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  tabButtonActive: { backgroundColor: '#3498DB', elevation: 2 },
  tabText: { color: '#64748B', fontWeight: 'bold', fontSize: 14 },
  tabTextActive: { color: '#FFFFFF' },

  syncCard: { backgroundColor: '#F39C12', padding: 15, borderRadius: 12, marginBottom: 20, alignItems: 'center' },
  syncTexto: { color: '#FFF', fontWeight: 'bold', marginBottom: 10 },
  btnSync: { backgroundColor: '#FFF', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  btnSyncTexto: { color: '#F39C12', fontWeight: 'bold' },

  card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 15, elevation: 5 },
  label: { fontSize: 14, fontWeight: '700', color: '#34495E', marginBottom: 5, marginTop: 15 },
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 12, fontSize: 18, backgroundColor: '#F8FAFC', color: '#2C3E50', letterSpacing: 1 },
  
  button: { backgroundColor: '#3498DB', padding: 18, borderRadius: 8, alignItems: 'center', marginTop: 25 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  
  editWarning: { color: '#E74C3C', fontWeight: 'bold', textAlign: 'center', marginBottom: 10, fontSize: 16 },
  editButtonsContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25 },
  btnCancelar: { backgroundColor: '#95A5A6', flex: 1, marginRight: 8, marginTop: 0 },
  btnAtualizar: { backgroundColor: '#2ECC71', flex: 1, marginLeft: 8, marginTop: 0 },

  sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginTop: 15, marginBottom: 10 },
  emptyText: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', marginBottom: 10 },
  
  monitorCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 15, borderRadius: 8, marginBottom: 10, borderLeftWidth: 5, elevation: 2 },
  monitorNome: { fontSize: 16, fontWeight: 'bold', color: '#2C3E50' },
  monitorDatas: { fontSize: 13, color: '#64748B', marginTop: 4 },
  
  actionButtonsContainer: { flexDirection: 'row', marginLeft: 10 },
  actionBtn: { padding: 8, backgroundColor: '#F5F7FA', borderRadius: 5, marginLeft: 8 }
});