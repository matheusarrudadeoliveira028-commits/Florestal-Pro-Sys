import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../src/supabase'; // Ajuste o caminho se necessário

export default function AlertasScreen() {
  const [alertas, setAlertas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const carregarAlertas = async () => {
    setLoading(prev => refreshing ? prev : true);
    try {
      const { data, error } = await supabase
        .from('alertas_limite')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50); // Mostra os últimos 50 alertas para não pesar a tela

      if (error) throw error;
      if (data) setAlertas(data);
    } catch (e) {
      console.log("Erro ao buscar alertas", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    carregarAlertas();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    carregarAlertas();
  };

  const formatarDataHora = (isoStr: string) => {
    const data = new Date(isoStr);
    return `${data.toLocaleDateString('pt-BR')} às ${data.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`;
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E74C3C" />
        <Text style={{ marginTop: 10, color: '#7F8C8D', fontWeight: 'bold' }}>Buscando registros...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Auditoria 🚨</Text>
        <Text style={styles.subtitle}>Tentativas de lançamento acima do limite</Text>
      </View>

      {alertas.length === 0 ? (
        <Text style={styles.emptyText}>Nenhuma tentativa bloqueada até o momento. 🎉</Text>
      ) : (
        alertas.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="warning" size={20} color="#E74C3C" />
              <Text style={styles.dataTexto}>{formatarDataHora(item.created_at)}</Text>
            </View>
            
            <Text style={styles.textoFiscal}>🕵️‍♂️ Fiscal: <Text style={{fontWeight: 'bold'}}>{item.fiscal_nome}</Text></Text>
            
            <View style={styles.divider} />
            
            <Text style={styles.detalhe}>👷 <Text style={styles.bold}>Trabalhador:</Text> {item.colaborador}</Text>
            <Text style={styles.detalhe}>📍 <Text style={styles.bold}>Local:</Text> {item.fazenda} (Quadra {item.quadra} / Ramal {item.ramal})</Text>
            <Text style={styles.detalhe}>🛠️ <Text style={styles.bold}>Serviço:</Text> {item.servico}</Text>

            <View style={styles.boxValores}>
              <View style={styles.col}>
                <Text style={styles.labelValor}>Tentou Lançar</Text>
                <Text style={styles.valorTentado}>{item.quantidade_tentada}</Text>
              </View>
              <View style={styles.col}>
                <Text style={styles.labelValor}>Limite da Árvore</Text>
                <Text style={styles.valorPermitido}>{item.limite_permitido}</Text>
              </View>
            </View>
          </View>
        ))
      )}
      <View style={{height: 40}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', padding: 15 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F7FA' },
  header: { marginBottom: 20, marginTop: 15, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 14, color: '#7F8C8D', marginTop: 3 },
  emptyText: { textAlign: 'center', color: '#7F8C8D', marginTop: 40, fontSize: 16, fontStyle: 'italic' },
  
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 15, marginBottom: 15, borderLeftWidth: 5, borderLeftColor: '#E74C3C', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dataTexto: { fontSize: 13, color: '#7F8C8D', marginLeft: 5, fontWeight: 'bold' },
  textoFiscal: { fontSize: 15, color: '#2C3E50', marginBottom: 10 },
  divider: { height: 1, backgroundColor: '#ECF0F1', marginBottom: 10 },
  
  detalhe: { fontSize: 14, color: '#34495E', marginBottom: 4 },
  bold: { fontWeight: 'bold' },
  
  boxValores: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, backgroundColor: '#FDEDEC', borderRadius: 8, padding: 10 },
  col: { alignItems: 'center', flex: 1 },
  labelValor: { fontSize: 11, color: '#C0392B', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 5 },
  valorTentado: { fontSize: 22, fontWeight: '900', color: '#E74C3C' },
  valorPermitido: { fontSize: 22, fontWeight: '900', color: '#27AE60' }
});