import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

export default function ConfiguracoesScreen() {
  const [saindo, setSaindo] = useState(false);

  // 👇 TRAVA DE SEGURANÇA MANTIDA E ATIVADA
  const fazerLogout = async () => {
    try {
      const pendentesStr = await AsyncStorage.getItem('@lancamentos_off');
      if (pendentesStr) {
        const pendentes = JSON.parse(pendentesStr);
        if (pendentes.length > 0) {
          return Alert.alert(
            "⚠️ Ação Bloqueada", 
            `Você tem ${pendentes.length} lançamentos offline guardados no celular!\n\nConecte-se à internet e aperte "ENVIAR TUDO" na tela de Início antes de encerrar seu turno, ou você perderá essa produção.`
          );
        }
      }
    } catch (e) {
      console.log("Erro ao checar mochila");
    }

    Alert.alert("Encerrar Turno", "Deseja realmente sair do sistema?", [
      { text: "Cancelar", style: "cancel" },
      { 
        text: "Sim, Sair", 
        style: 'destructive',
        onPress: async () => { 
          setSaindo(true); 
          try {
            // Limpa as chaves locais ao sair com segurança
            const chaves = await AsyncStorage.getAllKeys();
            const chavesParaApagar = chaves.filter(c => 
              c.includes('supabase') || c === '@perfil_offline' || c === '@lancamentos_off' || c === '@ausencias_off'
            );
            if (chavesParaApagar.length > 0) await AsyncStorage.multiRemove(chavesParaApagar);
            await supabase.auth.signOut();
          } catch (error) {
            console.log("Erro ao sair");
          } finally {
            setSaindo(false);
            router.replace('/login'); 
          }
        } 
      }
    ]);
  };

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.scrollContent} 
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Configurações ⚙️</Text>
        <Text style={styles.subtitle}>Gerenciamento do Aplicativo</Text>
      </View>

      <View style={styles.mainContent}>
        {/* SESSÃO DE LOGOUT */}
        <View style={styles.logoutSection}>
          <Text style={styles.logoutNote}>Seu turno acabou? Lembre-se de sincronizar seus dados antes de sair.</Text>
          <TouchableOpacity style={styles.btnSair} onPress={fazerLogout} disabled={saindo}>
             {saindo ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnSairTexto}>ENCERRAR TURNO (SAIR)</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 100 }, 
  header: { marginTop: 50, marginBottom: 25, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 15, color: '#7F8C8D' },
  mainContent: { width: '100%' },
  
  logoutSection: { marginTop: 40, paddingBottom: 20 },
  logoutNote: { textAlign: 'center', color: '#95A5A6', fontSize: 12, marginBottom: 15 },
  btnSair: { backgroundColor: '#E74C3C', paddingVertical: 16, borderRadius: 8, alignItems: 'center', shadowColor: '#E74C3C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 4 },
  btnSairTexto: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold', letterSpacing: 1 }
});