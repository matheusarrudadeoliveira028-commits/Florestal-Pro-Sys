import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function SuporteScreen() {
  
  const abrirWhatsApp = () => {
    Linking.openURL('https://wa.me/5515996800198');
  };

  const enviarEmail = () => {
    Linking.openURL('mailto:brekaztechltda@gmail.com');
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* HEADER COM ÍCONES CORRIGIDOS */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.logoBadge}>
            <MaterialCommunityIcons name="pine-tree" size={50} color="#27AE60" />
          </View>
          <View style={styles.logoBadge}>
            {/* Ícone barrel (tambor) corrigido */}
            <MaterialCommunityIcons name="barrel" size={50} color="#F39C12" />
          </View>
        </View>
        <Text style={styles.brandTitle}>BREKAZ</Text>
        <Text style={styles.subtitle}>Central de Ajuda e Suporte</Text>
      </View>

      {/* CARD DE AÇÃO */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="chatbubbles-outline" size={24} color="#2C3E50" />
          <Text style={styles.cardTitle}>Fale Conosco</Text>
        </View>
        
        <Text style={styles.textInfo}>
          Nossa equipe técnica está pronta para resolver qualquer dúvida ou problema com o sistema. Escolha o canal de sua preferência:
        </Text>

        <TouchableOpacity style={[styles.btn, styles.btnWhatsapp]} onPress={abrirWhatsApp} activeOpacity={0.8}>
          <Ionicons name="logo-whatsapp" size={24} color="#FFF" />
          <Text style={styles.btnText}>WhatsApp Oficial</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, styles.btnEmail]} onPress={enviarEmail} activeOpacity={0.8}>
          <Ionicons name="mail" size={24} color="#FFF" />
          <Text style={styles.btnText}>Enviar E-mail</Text>
        </TouchableOpacity>
      </View>

      {/* RODAPÉ */}
      <View style={styles.footer}>
        <View style={styles.divider} />
        <Text style={styles.footerText}>Brekaz Tecnologia Ltda.</Text>
        <Text style={styles.footerVersion}>Versão 1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 20 },
  header: { alignItems: 'center', marginTop: 40, marginBottom: 30 },
  logoRow: { flexDirection: 'row', gap: 15 },
  logoBadge: {
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 50,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  brandTitle: { fontSize: 32, fontWeight: '900', color: '#1B5E20', marginTop: 15, letterSpacing: 2 },
  subtitle: { fontSize: 16, color: '#7F8C8D', marginTop: 5, fontWeight: '500' },
  card: { 
    backgroundColor: '#FFF', 
    padding: 25, 
    borderRadius: 20, 
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 5,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50', marginLeft: 10 },
  textInfo: { fontSize: 15, color: '#455A64', marginBottom: 25, lineHeight: 22 },
  btn: { 
    flexDirection: 'row', 
    padding: 18, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 15 
  },
  btnWhatsapp: { backgroundColor: '#25D366' },
  btnEmail: { backgroundColor: '#2980B9' },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
  footer: { marginTop: 50, alignItems: 'center', marginBottom: 30 },
  divider: { height: 1, width: '60%', backgroundColor: '#E0E6ED', marginBottom: 20 },
  footerText: { color: '#7F8C8D', fontSize: 14, fontWeight: '600' },
  footerVersion: { color: '#B2BABB', fontSize: 12, marginTop: 5 }
});