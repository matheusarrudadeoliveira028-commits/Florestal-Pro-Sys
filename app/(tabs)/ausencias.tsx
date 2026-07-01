import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

export default function AusenciasScreen() {
  const [colaborador, setColaborador] = useState('');
  const [tipoAusencia, setTipoAusencia] = useState('Atestado'); 
  
  // ESTADOS PARA O ATESTADO
  const [dataAtestado, setDataAtestado] = useState('');
  const [diasAtestado, setDiasAtestado] = useState('');
  const [cidAtestado, setCidAtestado] = useState('');
  
  // 👉 ESTADOS PARA O ABONAMENTO (Agora com Data!)
  const [dataAbono, setDataAbono] = useState('');
  const [motivoAbono, setMotivoAbono] = useState('');
  
  const [listaColaboradores, setListaColaboradores] = useState<any[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [carregandoDados, setCarregandoDados] = useState(true);

  // Carrega a lista de colaboradores quando a tela abre
  useEffect(() => {
    carregarColaboradores();
  }, []);

  const carregarColaboradores = async () => {
    setCarregandoDados(true);
    try {
      const { data, error } = await supabase.from('colaboradores').select('*').order('nome');
      if (error) Alert.alert("Erro", error.message);
      else if (data) setListaColaboradores(data);
    } catch (e: any) {
      Alert.alert("Erro de Conexão", e.message);
    }
    setCarregandoDados(false);
  };

  // === MÁSCARA AUTOMÁTICA (Coloca as barras sozinho) ===
  const aplicarMascaraData = (texto: string) => {
    let v = texto.replace(/\D/g, ''); 
    if (v.length > 8) v = v.substring(0, 8); 
    if (v.length > 4) v = v.replace(/^(\d{2})(\d{2})(\d{1,4}).*/, '$1/$2/$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{1,2}).*/, '$1/$2');
    return v;
  };

  // === CONVERSOR PARA O BANCO (DD/MM/AAAA -> AAAA-MM-DD) ===
  const converterParaBanco = (dataBR: string) => {
    const partes = dataBR.split('/');
    if (partes.length === 3) return `${partes[2]}-${partes[1]}-${partes[0]}`;
    return null;
  };

  const salvarAusencia = async () => {
    if (!colaborador || !tipoAusencia) {
      return Alert.alert("Aviso", "Selecione o colaborador e o tipo de ocorrência!");
    }

    let dataLancamentoBD = null;

    // Trava de segurança para atestados
    if (tipoAusencia === 'Atestado') {
      if (!dataAtestado || dataAtestado.length !== 10 || !diasAtestado || !cidAtestado) {
        return Alert.alert("Aviso", "Preencha a data (completa), os dias e a CID do atestado médico!");
      }
      dataLancamentoBD = converterParaBanco(dataAtestado);
    }

    // 👉 Trava de segurança para o Abonamento
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

    // Concatena o motivo junto com a palavra Abonado para aparecer direto no PDF e no Fechamento
    const servicoFinal = tipoAusencia === 'Abonado' ? `Abonado (${motivoAbono})` : tipoAusencia;

    const payload: any = { 
      colaborador: colaborador, 
      servico: servicoFinal, // Grava "Atestado" ou "Abonado (Motivo)"
      fazenda: '-', 
      quadra: '-', 
      ramal: '-', 
      quantidade: 0,
      valor_unitario: 0,
      valor_total: 0,
      // Salva os dados do atestado (Se não for atestado, manda vazio/nulo)
      data_atestado: tipoAusencia === 'Atestado' ? dataLancamentoBD : null,
      dias_atestado: tipoAusencia === 'Atestado' ? parseInt(diasAtestado) : null,
      cid_atestado: tipoAusencia === 'Atestado' ? cidAtestado : null
    };

    // Força a data do diário para ser exatamente o dia selecionado (e não o dia do cadastro)
    if (dataLancamentoBD) {
      payload.data = dataLancamentoBD;
    }

    const { error } = await supabase.from('diarios_campo').insert([payload]);

    setSalvando(false);

    if (error) {
      Alert.alert("Erro ao salvar", error.message);
    } else {
      Alert.alert("✅ Sucesso!", `Lançamento registrado para ${colaborador} com sucesso!`);
      // Limpa os campos para o próximo lançamento
      setColaborador('');
      setDataAtestado('');
      setDiasAtestado('');
      setCidAtestado('');
      setDataAbono('');
      setMotivoAbono('');
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>Controle de Ponto 📅</Text>
        <Text style={styles.subtitle}>Lançamento de Atestados e Abonos</Text>
      </View>

      <View style={styles.card}>
        {carregandoDados ? (
          <View style={{alignItems: 'center', marginVertical: 20}}>
            <ActivityIndicator size="large" color="#3498DB" />
            <Text style={{marginTop: 10, color: '#7F8C8D'}}>Carregando equipe...</Text>
          </View>
        ) : (
          <>
            <Text style={styles.label}>Colaborador:</Text>
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

            {/* 👉 SEÇÃO DINÂMICA: SÓ APARECE SE FOR ABONADO PELA EMPRESA */}
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

            {/* CAIXA DE AVISO VISUAL */}
            <View style={[styles.avisoBox, tipoAusencia === 'Abonado' ? styles.avisoAbono : styles.avisoAtestado]}>
              <Text style={styles.avisoTexto}>
                {tipoAusencia === 'Abonado' 
                  ? "✅ Falta justificada/abonada pela empresa. O valor lançado será R$ 0,00." 
                  : "ℹ️ Ausência justificada (Saúde). O valor lançado será R$ 0,00."}
              </Text>
            </View>

            <TouchableOpacity 
              style={[styles.button, salvando ? styles.buttonDisabled : null, tipoAusencia === 'Abonado' ? styles.btnAbono : styles.btnAtestado]} 
              onPress={salvarAusencia} 
              disabled={salvando}
            >
              {salvando ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>Registrar {tipoAusencia}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.buttonAtualizar} onPress={carregarColaboradores}>
              <Text style={styles.buttonAtualizarText}>↻ Recarregar Equipe</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
      <View style={{height: 50}} /> 
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', padding: 20 },
  header: { marginBottom: 20, marginTop: 20, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 16, color: '#7F8C8D', marginTop: 5 },
  card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 15, elevation: 5 },
  label: { fontSize: 14, fontWeight: '700', color: '#34495E', marginBottom: 5, marginTop: 15 },
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', overflow: 'hidden' },
  picker: { height: 50, width: '100%', borderWidth: 0, backgroundColor: 'transparent' },
  
  input: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#F8FAFC', color: '#2C3E50', height: 50 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { width: '48%' },
  
  // ESTILOS DO ATESTADO
  atestadoBox: { backgroundColor: '#EBF5FB', padding: 15, borderRadius: 10, marginTop: 15, borderWidth: 1, borderColor: '#AED6F1' },
  atestadoTitulo: { fontSize: 16, fontWeight: 'bold', color: '#2980B9', marginBottom: 5, textAlign: 'center' },

  // ESTILOS DO ABONAMENTO
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
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  buttonAtualizar: { backgroundColor: '#E0E6ED', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  buttonAtualizarText: { color: '#34495E', fontSize: 14, fontWeight: 'bold' },
});