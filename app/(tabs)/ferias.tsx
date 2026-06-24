import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

export default function FeriasScreen() {
  const [colaborador, setColaborador] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  
  const [listaColaboradores, setListaColaboradores] = useState<any[]>([]);
  const [feriasPendentes, setFeriasPendentes] = useState<any[]>([]);
  
  const [salvando, setSalvando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    const mochila = await AsyncStorage.getItem('@mochila_colaboradores');
    if (mochila) setListaColaboradores(JSON.parse(mochila));

    const pendentes = await AsyncStorage.getItem('@ferias_off');
    if (pendentes) setFeriasPendentes(JSON.parse(pendentes));
  };

  // === MÁSCARA AUTOMÁTICA (Coloca as barras sozinho) ===
  const aplicarMascaraData = (texto: string) => {
    let v = texto.replace(/\D/g, ''); // Arranca tudo o que não for número
    if (v.length > 8) v = v.substring(0, 8); // Limita a 8 números (DDMMAAAA)
    
    if (v.length > 4) {
      v = v.replace(/^(\d{2})(\d{2})(\d{1,4}).*/, '$1/$2/$3');
    } else if (v.length > 2) {
      v = v.replace(/^(\d{2})(\d{1,2}).*/, '$1/$2');
    }
    return v;
  };

  const handleDataInicio = (texto: string) => setDataInicio(aplicarMascaraData(texto));
  const handleDataFim = (texto: string) => setDataFim(aplicarMascaraData(texto));

  // === CONVERSOR INVISÍVEL PARA O BANCO ===
  const converterParaBanco = (dataBR: string) => {
    const partes = dataBR.split('/');
    if (partes.length === 3) {
      return `${partes[2]}-${partes[1]}-${partes[0]}`; // Vira AAAA-MM-DD
    }
    return null;
  };

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
      setColaborador(''); setDataInicio(''); setDataFim('');
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
      if (error) throw error; // Se der erro no banco, agora ele grita aqui!

      await AsyncStorage.removeItem('@ferias_off');
      setFeriasPendentes([]);
      Alert.alert("🚀 Sincronizado!", "As férias foram enviadas para o sistema central.");
    } catch (e: any) {
      Alert.alert("Falha no Envio do Banco", e.message);
    } finally {
      setSincronizando(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 50 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Lançar Férias 🏖️</Text>
      <Text style={styles.subtitle}>Os dias trabalhados nestas datas sairão como "DIÁRIA" no relatório final.</Text>

      {/* CARTÃO DE SINCRONIZAÇÃO */}
      {feriasPendentes.length > 0 && (
        <View style={styles.syncCard}>
          <Text style={styles.syncTexto}>📦 {feriasPendentes.length} registos de férias aguardando envio</Text>
          <TouchableOpacity style={styles.btnSync} onPress={enviarParaNuvem} disabled={sincronizando}>
            {sincronizando ? <ActivityIndicator color="#F39C12" /> : <Text style={styles.btnSyncTexto}>ENVIAR PARA O BANCO</Text>}
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.card}>
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

        <TouchableOpacity style={styles.button} onPress={salvarLocalmente} disabled={salvando}>
          {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>💾 SALVAR PARA ENVIO</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2C3E50', marginTop: 40 },
  subtitle: { fontSize: 14, color: '#7F8C8D', marginBottom: 20 },
  
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
});