import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

export default function UsuariosScreen() {
  const [abaAtiva, setAbaAtiva] = useState<'cadastrar' | 'gerenciar'>('cadastrar');

  // ================= ESTADOS PARA CADASTRO =================
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [cargo, setCargo] = useState('Fiscal de Campo');
  const [salvando, setSalvando] = useState(false);

  // ================= ESTADOS PARA GESTÃO =================
  const [listaUsuarios, setListaUsuarios] = useState<any[]>([]);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(false);

  // ================= ESTADOS DO MODAL DE EDIÇÃO =================
  const [modalEdicaoVisivel, setModalEdicaoVisivel] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<any>(null);
  const [editNome, setEditNome] = useState('');
  const [editCargo, setEditCargo] = useState('');
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  // Carrega a lista quando a aba mudar para 'gerenciar'
  useEffect(() => {
    if (abaAtiva === 'gerenciar') {
      carregarListaUsuarios();
    }
  }, [abaAtiva]);

  const carregarListaUsuarios = async () => {
    setCarregandoUsuarios(true);
    const { data, error } = await supabase.from('perfis').select('*').order('nome');
    
    if (error) {
      Alert.alert('Erro', 'Não foi possível carregar a equipe.');
    } else if (data) {
      setListaUsuarios(data);
    }
    setCarregandoUsuarios(false);
  };

  // 👉 LÓGICA DE CADASTRO (MANTIDA INTACTA)
  const cadastrarUsuario = async () => {
    if (!nome || !email || !senha || !cargo) {
      return Alert.alert('Aviso', 'Preencha todos os campos!');
    }
    if (senha.length < 6) {
      return Alert.alert('Aviso', 'A senha deve ter pelo menos 6 caracteres.');
    }

    setSalvando(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password: senha,
    });

    if (authError) {
      setSalvando(false);
      return Alert.alert('Erro ao Criar Conta', authError.message);
    }

    if (authData.user) {
      const { error: profileError } = await supabase.from('perfis').insert([{
        id: authData.user.id,
        nome: nome.toUpperCase(),
        email: email.trim().toLowerCase(),
        cargo
      }]);

      if (profileError) {
        Alert.alert('Erro ao salvar Perfil', profileError.message);
      } else {
        Alert.alert('✅ Sucesso!', `${cargo} cadastrado com sucesso!`);
        setNome(''); setEmail(''); setSenha(''); setCargo('Fiscal de Campo');
      }
    }
    setSalvando(false);
  };

  // 👉 PREPARAR O MODAL DE EDIÇÃO
  const abrirEdicao = (usuario: any) => {
    setUsuarioEditando(usuario);
    setEditNome(usuario.nome);
    setEditCargo(usuario.cargo);
    setModalEdicaoVisivel(true);
  };

  // 👉 SALVAR ALTERAÇÕES DE NOME E CARGO
  const salvarAlteracoesPerfil = async () => {
    if (!editNome || !editCargo) {
      return Alert.alert("Aviso", "Nome e Cargo não podem ficar vazios.");
    }
    setSalvandoEdicao(true);

    const { error } = await supabase
      .from('perfis')
      .update({ nome: editNome.toUpperCase(), cargo: editCargo })
      .eq('id', usuarioEditando.id);

    setSalvandoEdicao(false);

    if (error) {
      Alert.alert("Erro", "Falha ao atualizar dados.");
    } else {
      Alert.alert("Sucesso", "Dados do usuário atualizados!");
      setModalEdicaoVisivel(false);
      carregarListaUsuarios(); // Recarrega a tela
    }
  };

  // 👉 DISPARAR E-MAIL DE REDEFINIÇÃO DE SENHA (A forma segura)
  const dispararResetDeSenha = () => {
    Alert.alert(
      "Redefinir Senha",
      `Deseja enviar um link de recuperação para ${usuarioEditando.email}?`,
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Enviar", 
          onPress: async () => {
            const { error } = await supabase.auth.resetPasswordForEmail(usuarioEditando.email);
            if (error) {
              Alert.alert("Erro", "Não foi possível enviar o e-mail: " + error.message);
            } else {
              Alert.alert("✅ Enviado!", "O link de redefinição foi enviado para o e-mail do colaborador.");
            }
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 50 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Gestão de Acessos 🔐</Text>
        <Text style={styles.subtitle}>Gerencie a equipe do sistema</Text>
      </View>

      {/* 👉 ABAS NAVEGÁVEIS */}
      <View style={styles.menuAbas}>
        <TouchableOpacity style={[styles.abaBotao, abaAtiva === 'cadastrar' && styles.abaAtiva]} onPress={() => setAbaAtiva('cadastrar')}>
          <Text style={[styles.abaTexto, abaAtiva === 'cadastrar' && styles.abaTextoAtivo]}>+ Novo Usuário</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.abaBotao, abaAtiva === 'gerenciar' && styles.abaAtiva]} onPress={() => setAbaAtiva('gerenciar')}>
          <Text style={[styles.abaTexto, abaAtiva === 'gerenciar' && styles.abaTextoAtivo]}>👥 Gerenciar Equipe</Text>
        </TouchableOpacity>
      </View>

      {/* ================= ABA DE CADASTRO ================= */}
      {abaAtiva === 'cadastrar' && (
        <View style={styles.card}>
          <Text style={styles.formTitle}>Criar Novo Login</Text>

          <Text style={styles.label}>Nome Completo:</Text>
          <TextInput style={styles.input} placeholder="Ex: João Silva" value={nome} onChangeText={setNome} autoCapitalize="words" />

          <Text style={styles.label}>Nível de Acesso (Cargo):</Text>
          <View style={styles.pickerContainer}>
            <Picker selectedValue={cargo} onValueChange={setCargo} style={styles.picker}>
              <Picker.Item label="Fiscal de Campo (Lança Produção)" value="Fiscal de Campo" />
              <Picker.Item label="Encarregado (Supervisiona Equipe)" value="Encarregado" />
              <Picker.Item label="Supervisor (Gere Fazenda)" value="Supervisor" />
              <Picker.Item label="Administrador (Acesso Total)" value="Administrador" />
            </Picker>
          </View>

          <Text style={styles.label}>E-mail (Login):</Text>
          <TextInput style={styles.input} placeholder="joao@fazenda.com" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />

          <Text style={styles.label}>Senha Provisória:</Text>
          <TextInput style={styles.input} placeholder="Mínimo 6 caracteres" secureTextEntry value={senha} onChangeText={setSenha} />

          <TouchableOpacity style={styles.button} onPress={cadastrarUsuario} disabled={salvando}>
            {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>CADASTRAR USUÁRIO</Text>}
          </TouchableOpacity>

          <View style={styles.avisoBox}>
            <Text style={styles.avisoTexto}>
              ⚠️ Nota: Ao cadastrar um novo usuário pelo app, o Supabase fará o login automático na conta dele. Após criar, você precisará relogar na sua conta Admin.
            </Text>
          </View>
        </View>
      )}

      {/* ================= ABA DE GERENCIAMENTO ================= */}
      {abaAtiva === 'gerenciar' && (
        <View style={styles.card}>
          <Text style={styles.formTitle}>Usuários do Sistema ({listaUsuarios.length})</Text>

          {carregandoUsuarios ? (
            <ActivityIndicator size="large" color="#2980B9" style={{ marginTop: 20 }} />
          ) : (
            <View style={{ marginTop: 10 }}>
              {listaUsuarios.map((user) => (
                <View key={user.id} style={styles.itemUsuario}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nomeUsuario}>{user.nome}</Text>
                    <Text style={styles.emailUsuario}>{user.email}</Text>
                    <View style={styles.badgeCargo}>
                      <Text style={styles.textoBadgeCargo}>{user.cargo}</Text>
                    </View>
                  </View>
                  
                  <TouchableOpacity style={styles.btnEditarIcon} onPress={() => abrirEdicao(user)}>
                    <Ionicons name="create-outline" size={24} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ================= MODAL DE EDIÇÃO ================= */}
      <Modal visible={modalEdicaoVisivel} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Editar Usuário</Text>
            
            <Text style={styles.label}>Nome Completo:</Text>
            <TextInput style={styles.input} value={editNome} onChangeText={setEditNome} autoCapitalize="words" />

            <Text style={styles.label}>Alterar Cargo:</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={editCargo} onValueChange={setEditCargo} style={styles.picker}>
                <Picker.Item label="Fiscal de Campo" value="Fiscal de Campo" />
                <Picker.Item label="Encarregado" value="Encarregado" />
                <Picker.Item label="Supervisor" value="Supervisor" />
                <Picker.Item label="Administrador" value="Administrador" />
              </Picker>
            </View>

            <View style={styles.caixaSeguranca}>
              <Text style={styles.labelSeguranca}>Segurança da Conta</Text>
              <Text style={styles.infoSeguranca}>E-mail: {usuarioEditando?.email}</Text>
              <TouchableOpacity style={styles.btnResetSenha} onPress={dispararResetDeSenha}>
                <Ionicons name="mail-outline" size={18} color="#FFF" style={{marginRight: 8}} />
                <Text style={styles.btnResetSenhaTexto}>Enviar Link de Nova Senha</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.rowBotoes}>
              <TouchableOpacity style={[styles.btnAcao, { backgroundColor: '#95A5A6' }]} onPress={() => setModalEdicaoVisivel(false)}>
                <Text style={styles.buttonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnAcao, { backgroundColor: '#27AE60' }]} onPress={salvarAlteracoesPerfil} disabled={salvandoEdicao}>
                {salvandoEdicao ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Salvar</Text>}
              </TouchableOpacity>
            </View>
            
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4F7', padding: 20 },
  header: { marginTop: 30, marginBottom: 20, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 14, color: '#7F8C8D' },
  
  menuAbas: { flexDirection: 'row', backgroundColor: '#E0E6ED', borderRadius: 10, padding: 4, marginBottom: 20 },
  abaBotao: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  abaAtiva: { backgroundColor: '#FFFFFF', elevation: 2 },
  abaTexto: { fontWeight: 'bold', color: '#7F8C8D' },
  abaTextoAtivo: { color: '#2980B9' },

  card: { backgroundColor: '#FFF', padding: 20, borderRadius: 15, elevation: 5 },
  formTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50', marginBottom: 15, borderBottomWidth: 1, paddingBottom: 10, borderColor: '#ECF0F1' },
  
  label: { fontSize: 14, fontWeight: 'bold', color: '#34495E', marginBottom: 5, marginTop: 15 },
  input: { borderWidth: 1, borderColor: '#D5DBDB', borderRadius: 8, padding: 15, fontSize: 16, backgroundColor: '#F8FAFC' },
  
  pickerContainer: { borderWidth: 1, borderColor: '#D5DBDB', borderRadius: 8, backgroundColor: '#F8FAFC', overflow: 'hidden', height: 55, justifyContent: 'center' },
  picker: { height: 55, width: '100%' },
  
  button: { backgroundColor: '#2980B9', padding: 18, borderRadius: 8, alignItems: 'center', marginTop: 25 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  
  avisoBox: { marginTop: 25, backgroundColor: '#FEF9E7', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#F1C40F' },
  avisoTexto: { fontSize: 12, color: '#D35400', textAlign: 'justify' },

  // Estilos da Lista de Gestão
  itemUsuario: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 15, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#E0E6ED' },
  nomeUsuario: { fontSize: 16, fontWeight: 'bold', color: '#2C3E50' },
  emailUsuario: { fontSize: 13, color: '#7F8C8D', marginTop: 2, marginBottom: 8 },
  badgeCargo: { backgroundColor: '#2980B9', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  textoBadgeCargo: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  btnEditarIcon: { backgroundColor: '#F39C12', padding: 12, borderRadius: 8, marginLeft: 10 },

  // Estilos do Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', width: '100%', borderRadius: 15, padding: 20, elevation: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E50', marginBottom: 5, textAlign: 'center' },
  
  caixaSeguranca: { backgroundColor: '#FDEDEC', padding: 15, borderRadius: 10, marginTop: 25, borderWidth: 1, borderColor: '#FADBD8' },
  labelSeguranca: { fontSize: 14, fontWeight: 'bold', color: '#C0392B', marginBottom: 5 },
  infoSeguranca: { fontSize: 13, color: '#7F8C8D', marginBottom: 15 },
  btnResetSenha: { backgroundColor: '#E74C3C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 8 },
  btnResetSenhaTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },

  rowBotoes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25, gap: 10 },
  btnAcao: { flex: 1, paddingVertical: 15, borderRadius: 8, alignItems: 'center' }
});