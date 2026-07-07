import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

export default function EstoqueDashboard() {
  const [estoque, setEstoque] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalGlobal, setTotalGlobal] = useState(0);

  // Estados para o Modal de Estoque Anterior
  const [modalAnteriorVisivel, setModalAnteriorVisivel] = useState(false);
  const [listaFazendas, setListaFazendas] = useState<string[]>([]);
  const [fazendaAnterior, setFazendaAnterior] = useState('');
  const [resinaAnterior, setResinaAnterior] = useState('ELLIOTTI');
  const [quantidadeAnterior, setQuantidadeAnterior] = useState('');
  const [salvandoAnterior, setSalvandoAnterior] = useState(false);

  // Estados para o Modal de BAIXA DE ESTOQUE (Perdas)
  const [modalBaixaVisivel, setModalBaixaVisivel] = useState(false);
  const [fazendaBaixa, setFazendaBaixa] = useState('');
  const [resinaBaixa, setResinaBaixa] = useState('ELLIOTTI');
  const [quantidadeBaixa, setQuantidadeBaixa] = useState('');
  const [motivoBaixa, setMotivoBaixa] = useState('');
  const [salvandoBaixa, setSalvandoBaixa] = useState(false);

  const carregarEstoque = async () => {
    try {
      setLoading(prev => refreshing ? prev : true);

      const { data: entradas, error: errEntradas } = await supabase.from('diarios_campo').select('fazenda, quantidade, servico, tipo_resina');
      const { data: anteriores, error: errAnteriores } = await supabase.from('estoque_anterior').select('fazenda, quantidade, tipo_resina');
      const { data: saidas, error: errSaidas } = await supabase.from('carregamentos').select('fazenda, quantidade, tipo_resina');
      const { data: baixas, error: errBaixas } = await supabase.from('baixas_estoque').select('fazenda, quantidade, tipo_resina');

      const { data: mapa } = await supabase.from('mapa_fazendas').select('fazenda');
      if (mapa) {
        setListaFazendas([...new Set(mapa.map(m => m.fazenda))] as string[]);
      }

      if (errEntradas || errSaidas || errAnteriores || errBaixas) throw new Error('Erro ao buscar dados');

      const mapaEstoque: Record<string, any> = {};

      const inicializarChave = (fz: string, res: string) => {
        const key = `${fz}|${res}`;
        if (!mapaEstoque[key]) {
          mapaEstoque[key] = { fazenda: fz, resina: res, entradas: 0, anterior: 0, saidas: 0, baixas: 0, saldo: 0 };
        }
        return key;
      };

      (anteriores || []).forEach((item) => {
        const fz = item.fazenda ? item.fazenda.trim() : 'Sem Fazenda';
        const res = item.tipo_resina || 'INDEFINIDA';
        const key = inicializarChave(fz, res);
        mapaEstoque[key].anterior += Number(item.quantidade) || 0;
      });

      (entradas || []).forEach((item) => {
        const nomeServico = item.servico ? String(item.servico).toLowerCase() : '';
        if (nomeServico.includes('coleta')) {
          const fz = item.fazenda ? item.fazenda.trim() : 'Sem Fazenda';
          const res = item.tipo_resina || 'INDEFINIDA';
          const key = inicializarChave(fz, res);
          mapaEstoque[key].entradas += Number(item.quantidade) || 0;
        }
      });

      (saidas || []).forEach((item) => {
        const fz = item.fazenda ? item.fazenda.trim() : 'Sem Fazenda';
        const res = item.tipo_resina || 'INDEFINIDA';
        const key = inicializarChave(fz, res);
        mapaEstoque[key].saidas += Number(item.quantidade) || 0;
      });

      (baixas || []).forEach((item) => {
        const fz = item.fazenda ? item.fazenda.trim() : 'Sem Fazenda';
        const res = item.tipo_resina || 'INDEFINIDA';
        const key = inicializarChave(fz, res);
        mapaEstoque[key].baixas += Number(item.quantidade) || 0;
      });

      let total = 0;
      const resultadoFinal = Object.values(mapaEstoque).map((item) => {
        const saldo = (item.entradas + item.anterior) - (item.saidas + item.baixas);
        total += saldo;
        return { ...item, saldo };
      });

      resultadoFinal.sort((a, b) => {
        if (a.fazenda === b.fazenda) return b.saldo - a.saldo;
        return a.fazenda.localeCompare(b.fazenda);
      });

      setEstoque(resultadoFinal);
      setTotalGlobal(total);
    } catch (error) {
      console.log('Erro ao calcular estoque:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    carregarEstoque();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    carregarEstoque();
  };

  const salvarEstoqueAnterior = async () => {
    if (!fazendaAnterior || !resinaAnterior || !quantidadeAnterior) {
      return Alert.alert("Aviso", "Preencha todos os campos!");
    }
    setSalvandoAnterior(true);
    try {
      const { error } = await supabase.from('estoque_anterior').insert([{
        fazenda: fazendaAnterior,
        tipo_resina: resinaAnterior,
        quantidade: parseInt(quantidadeAnterior)
      }]);
      if (error) throw error;
      Alert.alert("Sucesso", "Saldo inicial adicionado com sucesso!");
      setModalAnteriorVisivel(false);
      setQuantidadeAnterior('');
      setFazendaAnterior('');
      carregarEstoque();
    } catch (e) {
      Alert.alert("Erro", "Não foi possível salvar o saldo inicial.");
    } finally {
      setSalvandoAnterior(false);
    }
  };

  const salvarBaixaEstoque = async () => {
    if (!fazendaBaixa || !resinaBaixa || !quantidadeBaixa || !motivoBaixa) {
      return Alert.alert("Aviso", "Preencha todos os campos, incluindo o motivo da baixa!");
    }
    setSalvandoBaixa(true);
    try {
      const { error } = await supabase.from('baixas_estoque').insert([{
        fazenda: fazendaBaixa,
        tipo_resina: resinaBaixa,
        quantidade: parseInt(quantidadeBaixa),
        motivo: motivoBaixa
      }]);
      if (error) throw error;
      Alert.alert("Sucesso", "Baixa registrada! O saldo foi ajustado.");
      setModalBaixaVisivel(false);
      setQuantidadeBaixa('');
      setMotivoBaixa('');
      setFazendaBaixa('');
      carregarEstoque();
    } catch (e) {
      Alert.alert("Erro", "Não foi possível registrar a baixa.");
    } finally {
      setSalvandoBaixa(false);
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#27AE60" />
        <Text style={{ marginTop: 10, color: '#34495E', fontWeight: 'bold' }}>Calculando Estoque...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      // 👉 MAIS ESPAÇO DE ROLAGEM AQUI:
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerDashboard}>
        <View>
          <Text style={styles.tituloPainel}>Painel de Estoque</Text>
          <Text style={styles.descricaoPainel}>Controle por Fazenda e Resina</Text>
        </View>
        <TouchableOpacity style={styles.botaoAtualizar} onPress={onRefresh} activeOpacity={0.7}>
          <Ionicons name="refresh" size={18} color="#FFF" style={{ marginRight: 5 }} />
          <Text style={styles.textoBotao}>Atualizar</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.containerBotoesAcao}>
        <TouchableOpacity style={[styles.botaoAjuste, {backgroundColor: '#8E44AD'}]} onPress={() => setModalAnteriorVisivel(true)}>
          <Ionicons name="add-circle-outline" size={20} color="#FFF" style={{ marginRight: 5 }} />
          <Text style={styles.textoBotaoAjuste}>Saldo Inicial</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.botaoAjuste, {backgroundColor: '#E74C3C'}]} onPress={() => setModalBaixaVisivel(true)}>
          <Ionicons name="remove-circle-outline" size={20} color="#FFF" style={{ marginRight: 5 }} />
          <Text style={styles.textoBotaoAjuste}>Dar Baixa (Perda)</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cardGlobal}>
        <Ionicons name="cube" size={40} color="#FFF" />
        <View style={{ marginLeft: 15 }}>
          <Text style={styles.tituloGlobal}>Estoque Global Disponível</Text>
          <Text style={styles.valorGlobal}>{totalGlobal} Tambores</Text>
        </View>
      </View>

      <Text style={styles.subtitulo}>Detalhamento do Estoque</Text>

      {estoque.length === 0 ? (
        <Text style={styles.emptyText}>Nenhuma movimentação registrada nas tabelas.</Text>
      ) : (
        estoque.map((item, index) => (
          <View key={index} style={styles.cardFazenda}>
            <View style={styles.headerFazenda}>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <MaterialCommunityIcons name="pine-tree" size={24} color="#2C3E50" />
                <View style={{marginLeft: 10}}>
                  <Text style={styles.nomeFazenda}>{item.fazenda}</Text>
                  <View style={styles.badgeResina}>
                    <Text style={styles.textoBadgeResina}>{item.resina}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.linhaValores}>
              <View style={styles.colunaValor}>
                <Text style={styles.labelValor}>Estoque Ant.</Text>
                <Text style={[styles.textoValor, { color: '#8E44AD' }]}>{item.anterior}</Text>
              </View>
              <View style={styles.colunaValor}>
                <Text style={styles.labelValor}>Coletados</Text>
                <Text style={[styles.textoValor, { color: '#27AE60' }]}>+ {item.entradas}</Text>
              </View>
              <View style={styles.colunaValor}>
                <Text style={styles.labelValor}>Expedidos</Text>
                <Text style={[styles.textoValor, { color: '#E67E22' }]}>- {item.saidas}</Text>
              </View>
              <View style={styles.colunaValor}>
                <Text style={styles.labelValor}>Perdas (Baixa)</Text>
                <Text style={[styles.textoValor, { color: '#E74C3C' }]}>- {item.baixas}</Text>
              </View>
            </View>

            {/* BARRA DE SALDO DESTAQUE */}
            <View style={[styles.barraSaldo, { backgroundColor: item.saldo < 0 ? '#FDEDEC' : '#E8F8F5', borderColor: item.saldo < 0 ? '#FADBD8' : '#D5F5E3' }]}>
              <Text style={[styles.labelSaldoTotal, { color: item.saldo < 0 ? '#C0392B' : '#1E8449' }]}>SALDO ATUAL:</Text>
              <Text style={[styles.valorSaldoTotal, { color: item.saldo < 0 ? '#E74C3C' : '#27AE60' }]}>
                {item.saldo} Tambores
              </Text>
            </View>
          </View>
        ))
      )}
      
      {/* 👉 UM BLOCO INVISÍVEL NO FINAL PARA EMPURRAR A TELA AINDA MAIS PRA CIMA */}
      <View style={{ height: 80 }} />

      {/* MODAIS */}
      <Modal visible={modalAnteriorVisivel} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Lançar Estoque Anterior</Text>
            <Text style={styles.modalSub}>Adicione tambores que já estavam na fazenda antes do app.</Text>

            <Text style={styles.labelModal}>Fazenda:</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={fazendaAnterior} onValueChange={setFazendaAnterior} style={styles.picker}>
                <Picker.Item label="Selecione..." value="" />
                {listaFazendas.map((fz, i) => <Picker.Item key={i} label={fz} value={fz} />)}
              </Picker>
            </View>

            <Text style={styles.labelModal}>Tipo de Resina:</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={resinaAnterior} onValueChange={setResinaAnterior} style={styles.picker}>
                <Picker.Item label="ELLIOTTI" value="ELLIOTTI" />
                <Picker.Item label="TROPICAL" value="TROPICAL" />
                <Picker.Item label="HÍBRIDO" value="HÍBRIDO" />
              </Picker>
            </View>

            <Text style={styles.labelModal}>Qtd Tambores (Saldo Inicial):</Text>
            <TextInput style={styles.inputModal} placeholder="Ex: 50" keyboardType="numeric" value={quantidadeAnterior} onChangeText={setQuantidadeAnterior} />

            <View style={styles.rowBotoes}>
              <TouchableOpacity style={[styles.btnModal, {backgroundColor: '#95A5A6'}]} onPress={() => setModalAnteriorVisivel(false)}>
                <Text style={styles.textoBotao}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnModal, {backgroundColor: '#27AE60'}]} onPress={salvarEstoqueAnterior} disabled={salvandoAnterior}>
                {salvandoAnterior ? <ActivityIndicator color="#FFF" /> : <Text style={styles.textoBotao}>Salvar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={modalBaixaVisivel} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Registrar Baixa / Perda</Text>
            <Text style={styles.modalSub}>Retire tambores do estoque sem alterar os pagamentos dos funcionários.</Text>

            <Text style={styles.labelModal}>Fazenda:</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={fazendaBaixa} onValueChange={setFazendaBaixa} style={styles.picker}>
                <Picker.Item label="Selecione..." value="" />
                {listaFazendas.map((fz, i) => <Picker.Item key={i} label={fz} value={fz} />)}
              </Picker>
            </View>

            <Text style={styles.labelModal}>Tipo de Resina:</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={resinaBaixa} onValueChange={setResinaBaixa} style={styles.picker}>
                <Picker.Item label="ELLIOTTI" value="ELLIOTTI" />
                <Picker.Item label="TROPICAL" value="TROPICAL" />
                <Picker.Item label="HÍBRIDO" value="HÍBRIDO" />
              </Picker>
            </View>

            <Text style={styles.labelModal}>Qtd de Tambores Perdidos:</Text>
            <TextInput style={styles.inputModal} placeholder="Ex: 2" keyboardType="numeric" value={quantidadeBaixa} onChangeText={setQuantidadeBaixa} />

            <Text style={styles.labelModal}>Motivo (Obrigatório):</Text>
            <TextInput style={styles.inputModal} placeholder="Ex: Tambor furou, Acidente no trator..." value={motivoBaixa} onChangeText={setMotivoBaixa} />

            <View style={styles.rowBotoes}>
              <TouchableOpacity style={[styles.btnModal, {backgroundColor: '#95A5A6'}]} onPress={() => setModalBaixaVisivel(false)}>
                <Text style={styles.textoBotao}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnModal, {backgroundColor: '#E74C3C'}]} onPress={salvarBaixaEstoque} disabled={salvandoBaixa}>
                {salvandoBaixa ? <ActivityIndicator color="#FFF" /> : <Text style={styles.textoBotao}>Dar Baixa</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8', padding: 15 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F6F8' },
  headerDashboard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, marginTop: 5 },
  tituloPainel: { fontSize: 22, fontWeight: 'bold', color: '#2C3E50' },
  descricaoPainel: { fontSize: 13, color: '#7F8C8D' },
  
  botaoAtualizar: { backgroundColor: '#2980B9', flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 8, elevation: 2 },
  
  containerBotoesAcao: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  botaoAjuste: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8, elevation: 2, width: '48%' },
  textoBotaoAjuste: { color: '#FFF', fontWeight: 'bold', fontSize: 11 },
  textoBotao: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  
  cardGlobal: { backgroundColor: '#27AE60', borderRadius: 12, padding: 20, flexDirection: 'row', alignItems: 'center', elevation: 4, marginBottom: 25 },
  tituloGlobal: { color: '#E8F8F5', fontSize: 16, fontWeight: '600' },
  valorGlobal: { color: '#FFF', fontSize: 28, fontWeight: 'bold' },
  
  subtitulo: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50', marginBottom: 15, marginLeft: 5 },
  
  cardFazenda: { backgroundColor: '#FFF', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2, borderLeftWidth: 5, borderLeftColor: '#2980B9' },
  headerFazenda: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#ECF0F1', paddingBottom: 10 },
  nomeFazenda: { fontSize: 17, fontWeight: 'bold', color: '#2C3E50' },
  
  badgeResina: { backgroundColor: '#F39C12', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, marginTop: 4, alignSelf: 'flex-start' },
  textoBadgeResina: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },

  linhaValores: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 10 },
  colunaValor: { alignItems: 'center', width: '48%', backgroundColor: '#F8FAFC', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E0E6ED', marginBottom: 10 },
  labelValor: { fontSize: 11, color: '#7F8C8D', marginBottom: 5, fontWeight: 'bold', textTransform: 'uppercase' },
  textoValor: { fontSize: 17, fontWeight: '800' },
  
  barraSaldo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, borderWidth: 1 },
  labelSaldoTotal: { fontSize: 12, fontWeight: 'bold' },
  valorSaldoTotal: { fontSize: 18, fontWeight: '900' },

  emptyText: { textAlign: 'center', color: '#7F8C8D', marginTop: 35, fontSize: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', width: '100%', borderRadius: 15, padding: 20, elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50', textAlign: 'center' },
  modalSub: { fontSize: 12, color: '#7F8C8D', textAlign: 'center', marginBottom: 20, marginTop: 5 },
  labelModal: { fontSize: 13, fontWeight: 'bold', color: '#34495E', marginBottom: 5, marginTop: 10 },
  inputModal: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#F8FAFC' },
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', overflow: 'hidden', height: 50, justifyContent: 'center' },
  picker: { height: 50, width: '100%' },
  rowBotoes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25, gap: 10 },
  btnModal: { flex: 1, paddingVertical: 15, borderRadius: 8, alignItems: 'center' }
});