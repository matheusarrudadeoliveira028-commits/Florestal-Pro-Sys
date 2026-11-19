import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

const alertaWebMobile = (titulo: string, mensagem: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${titulo}\n\n${mensagem}`);
  } else {
    Alert.alert(titulo, mensagem);
  }
};

const confirmacaoWebMobile = (titulo: string, mensagem: string, textoConfirmar: string, aoConfirmar: () => void) => {
  if (Platform.OS === 'web') {
    const confirmado = window.confirm(`${titulo}\n\n${mensagem}`);
    if (confirmado) aoConfirmar();
  } else {
    Alert.alert(titulo, mensagem, [
      { text: 'Cancelar', style: 'cancel' },
      { text: textoConfirmar, style: textoConfirmar === 'Remover' ? 'destructive' : 'default', onPress: aoConfirmar }
    ]);
  }
};

const obterDataHojeLocalISO = () => {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
};

const buscarTodosColaboradores = async () => {
  let todos: any[] = [];
  const limite = 1000;
  let inicio = 0;
  let buscando = true;

  while (buscando) {
    const { data, error } = await supabase
      .from('colaboradores')
      .select('id, nome, fiscal_id, fiscal_vinculado')
      .order('nome', { ascending: true })
      .range(inicio, inicio + limite - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      todos = [...todos, ...data];
      if (data.length < limite) buscando = false;
      else inicio += limite;
    } else {
      buscando = false;
    }
  }
  return todos;
};

export default function EquipesScreen() {
  const [fiscais, setFiscais] = useState<any[]>([]);
  const [fiscalSelecionado, setFiscalSelecionado] = useState('');
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [busca, setBusca] = useState('');
  
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregarDados = async () => {
    setCarregando(true);
    try {
      const [{ data: fiscaisData }, colabData] = await Promise.all([
        supabase
          .from('perfis')
          .select('id, nome')
          .in('cargo', ['Fiscal de Campo', 'Supervisor', 'Encarregado', 'Administrador'])
          .order('nome'),
        buscarTodosColaboradores()
      ]);
        
      if (fiscaisData) setFiscais(fiscaisData);
      if (colabData) setColaboradores(colabData);
    } catch (err: any) {
      console.log('Erro ao carregar equipes:', err);
      alertaWebMobile('Erro', 'Não foi possível carregar as equipes.');
    } finally {
      setCarregando(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      carregarDados();
    }, [])
  );

  // === FLUXO DE ADICIONAR / TRANSFERIR ===
  const confirmarVinculo = (colab: any) => {
    if (colab.fiscal_id && colab.fiscal_id !== fiscalSelecionado) {
      const fiscalAntigo = fiscais.find(f => f.id === colab.fiscal_id)?.nome || colab.fiscal_vinculado || 'outra equipe';
      confirmacaoWebMobile(
        'Colaborador Ocupado',
        `${colab.nome} já pertence à equipe "${fiscalAntigo}". Deseja transferi-lo para esta equipe?`,
        'Transferir',
        () => atualizarBanco(colab, fiscalSelecionado)
      );
    } else {
      atualizarBanco(colab, fiscalSelecionado);
    }
  };

  // === FLUXO DE REMOVER ===
  const confirmarDesvinculo = (colab: any) => {
    confirmacaoWebMobile(
      'Remover da Equipe',
      `Tem certeza que deseja remover ${colab.nome} desta equipe?`,
      'Remover',
      () => atualizarBanco(colab, null)
    );
  };

  // === COMUNICAÇÃO COM O BANCO (ATUALIZA fiscal_id + fiscal_vinculado + DIÁRIO DE HOJE) ===
  const atualizarBanco = async (colab: any, novoFiscalId: string | null) => {
    setSalvando(true);
    try {
      const fiscalObj = novoFiscalId ? fiscais.find(f => f.id === novoFiscalId) : null;
      const novoFiscalNome = fiscalObj ? fiscalObj.nome : null;

      const { error } = await supabase
        .from('colaboradores')
        .update({
          fiscal_id: novoFiscalId,
          fiscal_vinculado: novoFiscalNome
        })
        .eq('id', colab.id);

      if (error) {
        console.log('ERRO AO SALVAR:', error);
        alertaWebMobile('Erro no Banco', error.message);
        return;
      }

      // Atualiza também lançamentos já feitos HOJE para este colaborador não ficar preso na equipe antiga
      if (novoFiscalNome && colab.nome) {
        try {
          const hojeISO = obterDataHojeLocalISO();
          await supabase
            .from('diarios_campo')
            .update({ fiscal_nome: novoFiscalNome })
            .eq('colaborador', colab.nome)
            .gte('data', `${hojeISO} 00:00:00`)
            .lte('data', `${hojeISO} 23:59:59`);
        } catch (errDiario) {
          console.warn('Aviso ao sincronizar diário de hoje:', errDiario);
        }
      }

      setColaboradores(prev =>
        prev.map(c =>
          c.id === colab.id
            ? { ...c, fiscal_id: novoFiscalId, fiscal_vinculado: novoFiscalNome }
            : c
        )
      );
    } finally {
      setSalvando(false);
    }
  };

  // === FILTROS PARA DIVIDIR A TELA ===
  const minhaEquipe = colaboradores.filter(c => c.fiscal_id === fiscalSelecionado);
  
  const disponiveis = colaboradores.filter(c => 
    c.fiscal_id !== fiscalSelecionado && 
    String(c.nome || '').toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Montar Equipes 👥</Text>
        <Text style={styles.subtitle}>Gerencie a distribuição de funcionários</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>1. Selecione o Fiscal Líder:</Text>
        <View style={styles.pickerContainer}>
          <Picker selectedValue={fiscalSelecionado} onValueChange={setFiscalSelecionado}>
            <Picker.Item label="Escolha um Fiscal..." value="" />
            {fiscais.map(f => (
              <Picker.Item key={f.id} label={f.nome} value={f.id} />
            ))}
          </Picker>
        </View>
      </View>

      {fiscalSelecionado ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 50 }} keyboardShouldPersistTaps="handled">
          
          {carregando || salvando ? <ActivityIndicator size="large" color="#3498DB" style={{ marginVertical: 20 }} /> : null}

          {/* === SEÇÃO 1: MINHA EQUIPE === */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>🟢 Equipe Atual ({minhaEquipe.length})</Text>
            {minhaEquipe.length === 0 ? (
              <Text style={styles.emptyText}>Nenhum colaborador nesta equipe ainda.</Text>
            ) : (
              minhaEquipe.map(colab => (
                <View key={colab.id} style={[styles.row, styles.rowEquipe]}>
                  <Text style={styles.nomeEquipe}>{colab.nome}</Text>
                  <TouchableOpacity 
                    style={styles.btnRemover} 
                    onPress={() => confirmarDesvinculo(colab)}
                    disabled={salvando}
                  >
                    <Text style={styles.btnRemoverTexto}>Remover</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          {/* === SEÇÃO 2: ADICIONAR COLABORADORES === */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>➕ Adicionar Colaborador</Text>
            
            <TextInput
              style={styles.searchInput}
              placeholder="🔍 Buscar funcionário pelo nome..."
              value={busca}
              onChangeText={setBusca}
            />

            {disponiveis.slice(0, 30).map(colab => {
              const isEmOutraEquipe = colab.fiscal_id && colab.fiscal_id !== fiscalSelecionado;
              const nomeOutraEquipe = isEmOutraEquipe
                ? (fiscais.find(f => f.id === colab.fiscal_id)?.nome || colab.fiscal_vinculado || 'outra equipe')
                : '';

              return (
                <View key={colab.id} style={[styles.row, styles.rowDisponivel]}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.nomeDisponivel}>{colab.nome}</Text>
                    {isEmOutraEquipe && (
                      <Text style={styles.textoAlerta}>⚠️ Em outra equipe ({nomeOutraEquipe})</Text>
                    )}
                  </View>
                  
                  <TouchableOpacity 
                    style={[styles.btnAdicionar, isEmOutraEquipe && styles.btnTransferir]} 
                    onPress={() => confirmarVinculo(colab)}
                    disabled={salvando}
                  >
                    <Text style={styles.btnAdicionarTexto}>
                      {isEmOutraEquipe ? 'Transferir' : 'Adicionar'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            
            {disponiveis.length > 30 && (
              <Text style={styles.emptyText}>Muitos resultados. Use a busca acima para filtrar.</Text>
            )}
            {disponiveis.length === 0 && (
              <Text style={styles.emptyText}>Nenhum colaborador encontrado.</Text>
            )}
          </View>

        </ScrollView>
      ) : (
        <View style={styles.avisoBox}>
          <Text style={styles.avisoTexto}>👆 Selecione um fiscal acima para ver e montar a equipe dele.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', padding: 20 },
  header: { marginTop: 30, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 14, color: '#7F8C8D', marginTop: 5 },
  
  card: { backgroundColor: '#FFF', padding: 20, borderRadius: 12, elevation: 3, marginBottom: 15 },
  label: { fontSize: 15, fontWeight: 'bold', color: '#34495E', marginBottom: 10 },
  pickerContainer: { borderWidth: 1, borderColor: '#D5DBDB', borderRadius: 8, backgroundColor: '#F8FAFC' },
  
  sectionContainer: { backgroundColor: '#FFF', padding: 15, borderRadius: 12, elevation: 2, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50', marginBottom: 15 },
  emptyText: { color: '#95A5A6', fontStyle: 'italic', textAlign: 'center', marginVertical: 10 },
  
  searchInput: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#F8FAFC', marginBottom: 15 },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1 },
  
  rowEquipe: { borderColor: '#A9DFBF', backgroundColor: '#E8F8F5' },
  nomeEquipe: { fontSize: 16, fontWeight: 'bold', color: '#1E8449', flex: 1 },
  btnRemover: { backgroundColor: '#E74C3C', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  btnRemoverTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },

  rowDisponivel: { borderColor: '#E0E6ED', backgroundColor: '#FDFEFE' },
  nomeDisponivel: { fontSize: 16, color: '#34495E', fontWeight: '600' },
  textoAlerta: { fontSize: 12, color: '#E67E22', marginTop: 2, fontWeight: 'bold' },
  
  btnAdicionar: { backgroundColor: '#3498DB', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  btnTransferir: { backgroundColor: '#F39C12' },
  btnAdicionarTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },

  avisoBox: { flex: 1, justifyContent: 'center', alignItems: 'center', opacity: 0.6 },
  avisoTexto: { fontSize: 16, color: '#34495E', textAlign: 'center', paddingHorizontal: 20 }
});