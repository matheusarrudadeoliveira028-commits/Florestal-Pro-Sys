import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

export default function ConfiguracoesScreen() {
  const [saindo, setSaindo] = useState(false);

  // 🟢 ESTADOS DO PAINEL MASTER ADMIN
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(false);
  
  // 🟢 ESTADOS DO MODAL DE EDIÇÃO
  const [modalVisivel, setModalVisivel] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<any>(null);
  const [fazendasInput, setFazendasInput] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    verificarAcessoMasterAdmin();
  }, []);

  const verificarAcessoMasterAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // 🟢 LIBERA O PAINEL APENAS PARA ESTE EMAIL
      if (user && user.email?.toLowerCase() === 'contato@brekaztech.com.br') {
        setIsMasterAdmin(true);
        carregarUsuarios();
      }
    } catch (e) {
      console.log("Erro ao checar admin master");
    }
  };

  const carregarUsuarios = async () => {
    setCarregandoUsuarios(true);
    const { data, error } = await supabase.from('perfis').select('id, nome, email, cargo, fazendas_permitidas').order('nome');
    if (data) setUsuarios(data);
    else if (error) Alert.alert("Erro", "Falha ao carregar usuários.");
    setCarregandoUsuarios(false);
  };

  const abrirModalEdicao = (usuario: any) => {
    setUsuarioEditando(usuario);
    // Transforma o array em string separada por vírgula se for array, ou mantém como texto
    let textoAtual = usuario.fazendas_permitidas || '';
    if (Array.isArray(textoAtual)) textoAtual = textoAtual.join(', ');
    
    setFazendasInput(textoAtual);
    setModalVisivel(true);
  };

  const salvarPermissoes = async () => {
    setSalvando(true);
    
    // Limpa os espaços e deixa tudo em maiúsculo (ex: "TAMANDUA, SAO JOAO")
    const permissoesLimpas = fazendasInput
      .split(',')
      .map(f => f.trim().toUpperCase())
      .filter(f => f.length > 0)
      .join(', '); // Salvando como string no banco para facilitar

    const { error } = await supabase
      .from('perfis')
      .update({ fazendas_permitidas: permissoesLimpas })
      .eq('id', usuarioEditando.id);

    if (error) {
      Alert.alert("Erro", "Não foi possível salvar as permissões.");
    } else {
      Alert.alert("Sucesso", "Permissões atualizadas com sucesso!");
      setModalVisivel(false);
      carregarUsuarios(); // Recarrega a lista
    }
    setSalvando(false);
  };

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

        {/* 🟢 PAINEL EXCLUSIVO DO ADMIN MASTER */}
        {isMasterAdmin && (
          <View style={styles.adminSection}>
            <Text style={styles.adminTitle}>🛡️ Gestão de Acessos (Fiscais)</Text>
            <Text style={styles.adminSub}>Defina quais fazendas cada fiscal pode visualizar.</Text>
            
            {carregandoUsuarios ? (
              <ActivityIndicator color="#2980B9" style={{ marginTop: 20 }} />
            ) : (
              usuarios.map((usr) => (
                <TouchableOpacity 
                  key={usr.id} 
                  style={styles.userCard}
                  onPress={() => abrirModalEdicao(usr)}
                >
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{usr.nome}</Text>
                    <Text style={styles.userEmail}>{usr.cargo} | {usr.email}</Text>
                    <Text style={styles.userFazendas}>
                      Permitidas: <Text style={{ color: '#27AE60', fontWeight: 'bold' }}>
                        {usr.fazendas_permitidas ? usr.fazendas_permitidas : 'Todas (Sem restrição)'}
                      </Text>
                    </Text>
                  </View>
                  <Text style={styles.editIcon}>✏️</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* SESSÃO DE LOGOUT */}
        <View style={styles.logoutSection}>
          <Text style={styles.logoutNote}>Seu turno acabou? Lembre-se de sincronizar seus dados antes de sair.</Text>
          <TouchableOpacity style={styles.btnSair} onPress={fazerLogout} disabled={saindo}>
             {saindo ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnSairTexto}>ENCERRAR TURNO (SAIR)</Text>}
          </TouchableOpacity>
        </View>

      </View>

      {/* 🟢 MODAL DE EDIÇÃO DE ACESSO */}
      <Modal visible={modalVisivel} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Editar Acesso</Text>
            <Text style={styles.modalSubtitle}>{usuarioEditando?.nome}</Text>

            <Text style={styles.labelInput}>Fazendas Permitidas</Text>
            <Text style={styles.helperText}>Digite os nomes exatos separados por vírgula (Ex: TAMANDUA, SAO JOAO). Deixe vazio para não ter restrição.</Text>
            
            <TextInput
              style={styles.inputModal}
              value={fazendasInput}
              onChangeText={setFazendasInput}
              placeholder="Ex: TAMANDUA, ESTANCIA"
              placeholderTextColor="#BDC3C7"
              autoCapitalize="characters"
            />

            <View style={styles.row}>
              <TouchableOpacity 
                style={styles.btnModalCancelar} 
                onPress={() => setModalVisivel(false)}
                disabled={salvando}
              >
                <Text style={styles.btnModalTextoCinzento}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.btnModalSalvar} 
                onPress={salvarPermissoes}
                disabled={salvando}
              >
                {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnModalTexto}>💾 Salvar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  btnSairTexto: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold', letterSpacing: 1 },

  // 🟢 ESTILOS DO PAINEL ADMIN
  adminSection: { backgroundColor: '#FFF', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#3498DB', marginBottom: 20 },
  adminTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50' },
  adminSub: { fontSize: 13, color: '#7F8C8D', marginBottom: 15 },
  userCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#ECF0F1' },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: 'bold', color: '#34495E' },
  userEmail: { fontSize: 12, color: '#7F8C8D', marginVertical: 2 },
  userFazendas: { fontSize: 12, color: '#34495E', marginTop: 2 },
  editIcon: { fontSize: 18, marginLeft: 10 },

  // 🟢 ESTILOS DO MODAL
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContainer: { backgroundColor: '#FFF', padding: 20, borderRadius: 12, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E50', textAlign: 'center' },
  modalSubtitle: { fontSize: 15, color: '#7F8C8D', textAlign: 'center', marginBottom: 20, fontStyle: 'italic' },
  labelInput: { fontSize: 14, fontWeight: 'bold', color: '#34495E', marginBottom: 5 },
  helperText: { fontSize: 11, color: '#95A5A6', marginBottom: 10 },
  inputModal: { backgroundColor: '#F8FAFC', color: '#2C3E50', paddingHorizontal: 15, borderRadius: 8, fontSize: 15, borderWidth: 1, borderColor: '#BDC3C7', marginBottom: 25, height: 50 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  btnModalCancelar: { backgroundColor: '#EAEDED', padding: 14, borderRadius: 8, flex: 1, alignItems: 'center', marginRight: 10 },
  btnModalSalvar: { backgroundColor: '#2980B9', padding: 14, borderRadius: 8, flex: 1, alignItems: 'center' },
  btnModalTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  btnModalTextoCinzento: { color: '#34495E', fontWeight: 'bold', fontSize: 15 }
});