import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../src/supabase';

// 👉 IMPORTAÇÃO DO LOGO (Ajuste o caminho e nome do arquivo se necessário)
import LogoImg from '../assets/images/logo.png';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState(''); 
  const [carregando, setCarregando] = useState(false);
  const [modoLogin, setModoLogin] = useState(true); 

  // 👉 PASSE LIVRE OFFLINE: Verifica a mochila do celular na hora que a tela abre!
  useEffect(() => {
    verificarAcessoOffline();
  }, []);

  const verificarAcessoOffline = async () => {
    try {
      const perfilSalvo = await AsyncStorage.getItem('@perfil_offline');
      if (perfilSalvo) {
        // Encontrou o cara na memória do celular! Não pede internet, não pede senha, joga ele pra dentro!
        router.replace('/(tabs)');
      }
    } catch (e) {
      console.log("Erro ao checar mochila no login", e);
    }
  };

  const fazerLogin = async () => {
    if (!email || !senha) return Alert.alert('Aviso', 'Preencha e-mail e senha!');
    
    setCarregando(true);
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (authError) {
      setCarregando(false);
      return Alert.alert('Erro no Login', 'E-mail ou senha incorretos.');
    } 

    if (authData.user) {
      const { data: perfil } = await supabase
        .from('perfis')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (perfil) {
        await AsyncStorage.setItem('@perfil_offline', JSON.stringify(perfil));
      } else {
        await AsyncStorage.setItem('@perfil_offline', JSON.stringify({ cargo: 'Fiscal' }));
      }

      setCarregando(false);
      router.replace('/(tabs)');
    }
  };

  const fazerCadastro = async () => {
    if (!nome || !email || !senha) return Alert.alert('Aviso', 'Preencha todos os campos!');
    if (senha.length < 6) return Alert.alert('Aviso', 'A senha deve ter no mínimo 6 caracteres.');
    
    setCarregando(true);
    
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: senha,
    });

    if (authError) {
      setCarregando(false);
      return Alert.alert('Erro no Cadastro', authError.message);
    }

    if (authData.user) {
      const novoPerfil = {
        id: authData.user.id,
        nome: nome,
        email: email,
        cargo: 'Administrador' 
      };

      const { error: profileError } = await supabase.from('perfis').insert([novoPerfil]);

      if (profileError) {
        setCarregando(false);
        Alert.alert('Erro ao salvar Perfil', profileError.message);
      } else {
        await AsyncStorage.setItem('@perfil_offline', JSON.stringify(novoPerfil));
        
        setCarregando(false);
        Alert.alert('✅ Bem-vindo!', 'Conta de Administrador criada com sucesso!');
        router.replace('/(tabs)');
      }
    } else {
      setCarregando(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logoBox}>
          {/* 👉 EXIBIÇÃO DO LOGO */}
          <Image 
            source={LogoImg} 
            style={styles.logoImage} 
            resizeMode="contain" 
          />
          <Text style={styles.subText}>Sejam bem-vindos!</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.tituloCard}>
            {modoLogin ? 'Acesso ao Sistema' : 'Criar Conta Mestra'}
          </Text>

          {!modoLogin && (
            <>
              <Text style={styles.label}>Seu Nome:</Text>
              <TextInput 
                style={styles.input} 
                placeholder="Ex: Matheus Arruda" 
                value={nome}
                onChangeText={setNome}
              />
            </>
          )}

          <Text style={styles.label}>E-mail:</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Digite seu e-mail" 
            keyboardType="email-address" 
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Senha:</Text>
          <TextInput 
            style={styles.input} 
            placeholder="********" 
            secureTextEntry 
            value={senha}
            onChangeText={setSenha}
          />

          <TouchableOpacity 
            style={styles.button} 
            onPress={modoLogin ? fazerLogin : fazerCadastro} 
            disabled={carregando}
          >
            {carregando ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>
                {modoLogin ? 'ENTRAR NO SISTEMA' : 'CADASTRAR E ENTRAR'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.btnAlternar} 
            onPress={() => setModoLogin(!modoLogin)}
          >
            <Text style={styles.btnAlternarTexto}>
              {modoLogin ? 'Primeiro acesso? Crie sua conta de Admin' : 'Já tem conta? Faça Login aqui'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#ffffff', justifyContent: 'center', padding: 20, paddingBottom: 40 },
  logoBox: { alignItems: 'center', marginBottom: 35 },
  logoImage: { 
    width: 700,  
    height: 400, 
    marginBottom: 10 
  },
  subText: { fontSize: 25, color: '#000000', marginTop: 5, fontWeight: '500' },
  card: { backgroundColor: '#FFF', padding: 25, borderRadius: 15, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 8 },
  tituloCard: { fontSize: 20, fontWeight: 'bold', color: '#2980B9', textAlign: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#ECF0F1', paddingBottom: 12 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#ffffff', marginBottom: 8, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#3abebe', borderRadius: 8, padding: 15, fontSize: 16, backgroundColor: '#F8FAFC', marginBottom: 5 },
  button: { backgroundColor: '#27ae60', padding: 18, borderRadius: 8, alignItems: 'center', marginTop: 25 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  btnAlternar: { marginTop: 25, alignItems: 'center', padding: 10 },
  btnAlternarTexto: { color: '#3498DB', fontSize: 14, fontWeight: 'bold', textDecorationLine: 'underline' }
});