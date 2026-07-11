import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

export default function PermissoesScreen() {
  const [cargoSelecionado, setCargoSelecionado] = useState('Fiscal de Campo');
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [permissoes, setPermissoes] = useState<any>({});

  // 👉 NOVO: Adicionado 'estoque' e 'alertas' na lista de permissões
  const nomesTelas = [
    { chave: 'estoque', nome: '📦 Estoque / Inventário' },
    { chave: 'carregamentos', nome: '🚛 Expedição / Romaneio' },
    { chave: 'mapa', nome: '🗺️ Mapa Da Fazenda' },
    { chave: 'fechamento', nome: '💰 Fechamento Financeiro' },
    { chave: 'alertas', nome: '🚨 Auditoria de Alertas' },
    { chave: 'usuarios', nome: '👥 Gestão De Acessos' },
    { chave: 'estatisticas', nome: '📊 Estatísticas De Produção' },
    { chave: 'ferias', nome: '🏖️ Férias' },
    { chave: 'equipes', nome: '👷 Equipes' },
    { chave: 'suporte', nome: '🎧 Suporte Brekaz' },
    { chave: 'ausencias', nome: '❌ Ausências' },
    { chave: 'cadastros', nome: '📝 Cadastros' },
    { chave: 'relatorios', nome: '📄 Relatórios' },
    { chave: 'colaboradores', nome: '🤝 Colaboradores' },
    { chave: 'retroativo', nome: '⏳ Lançamento Retroativo' }
  ];

  useEffect(() => {
    carregarPermissoes();
  }, [cargoSelecionado]);

  const carregarPermissoes = async () => {
    setCarregando(true);
    try {
      const { data } = await supabase.from('permissoes_menu').select('telas').eq('cargo', cargoSelecionado).single();
      
      let objLido = {};
      if (data && data.telas) {
        objLido = typeof data.telas === 'string' ? JSON.parse(data.telas) : data.telas;
      }

      const permissoesTratadas: any = {};
      nomesTelas.forEach(tela => {
        permissoesTratadas[tela.chave] = objLido[tela.chave as keyof typeof objLido] === true;
      });

      setPermissoes(permissoesTratadas);
    } catch (e) {
      const permissoesZeradas: any = {};
      nomesTelas.forEach(tela => {
        permissoesZeradas[tela.chave] = false;
      });
      setPermissoes(permissoesZeradas);
    }
    setCarregando(false);
  };

  const toggleSwitch = (chave: string) => {
    setPermissoes((estadoAnterior: any) => ({
      ...estadoAnterior,
      [chave]: !estadoAnterior[chave]
    }));
  };

  const salvarPermissoes = async () => {
    setSalvando(true);
    const { error } = await supabase
      .from('permissoes_menu')
      .upsert({ cargo: cargoSelecionado, telas: permissoes }, { onConflict: 'cargo' });

    if (error) {
      Alert.alert("Erro", "Falha ao salvar no banco.");
    } else {
      Alert.alert("Sucesso", `Regras para '${cargoSelecionado}' salvas!`);
    }
    setSalvando(false);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Painel de Permissões 🔐</Text>
        <Text style={styles.subtitle}>Gerencie os acessos do menu</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Cargo para Configurar:</Text>
        <View style={styles.pickerBox}>
          <Picker selectedValue={cargoSelecionado} onValueChange={setCargoSelecionado}>
            <Picker.Item label="Fiscal de Campo" value="Fiscal de Campo" />
            <Picker.Item label="Supervisor" value="Supervisor" />
            <Picker.Item label="Encarregado" value="Encarregado" />
            <Picker.Item label="Administrador" value="Administrador" />
          </Picker>
        </View>

        {carregando ? (
          <ActivityIndicator size="large" color="#27AE60" style={{ marginTop: 20 }} />
        ) : (
          <View style={styles.listaTelas}>
            {nomesTelas.map((tela) => (
              <View key={tela.chave} style={styles.itemTela}>
                <Text style={styles.nomeTela}>{tela.nome}</Text>
                <Switch
                  trackColor={{ false: "#BDC3C7", true: "#27AE60" }}
                  thumbColor="#FFF"
                  onValueChange={() => toggleSwitch(tela.chave)}
                  value={permissoes[tela.chave]} 
                />
              </View>
            ))}

            <TouchableOpacity style={styles.btnSalvar} onPress={salvarPermissoes} disabled={salvando}>
              {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnSalvarTxt}>SALVAR PERMISSÕES</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F4F7' },
  header: { marginTop: 45, marginBottom: 15, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 14, color: '#7F8C8D' },
  card: { backgroundColor: '#FFF', margin: 15, padding: 20, borderRadius: 15, elevation: 3, marginBottom: 50 },
  label: { fontSize: 16, fontWeight: 'bold', color: '#34495E', marginBottom: 10 },
  pickerBox: { backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#DCDFE6', borderRadius: 8, marginBottom: 20 },
  listaTelas: { marginTop: 10 },
  itemTela: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#ECF0F1' },
  nomeTela: { fontSize: 16, color: '#34495E', fontWeight: '500' },
  btnSalvar: { backgroundColor: '#2980B9', padding: 15, borderRadius: 10, marginTop: 30, alignItems: 'center' },
  btnSalvarTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});