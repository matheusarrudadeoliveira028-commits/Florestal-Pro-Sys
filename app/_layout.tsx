import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Alert, Platform } from 'react-native'; // 👉 ADICIONADO AQUI
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

// 👉 SEQUESTRO GLOBAL DE ALERTAS PARA A WEB
// Isso faz o Alert.alert nativo funcionar na Netlify sem precisar alterar tela por tela!
if (Platform.OS === 'web') {
  Alert.alert = (title, message, buttons) => {
    // Se tiver botões (como a confirmação de exclusão que fizemos antes)
    if (buttons && buttons.length > 1) {
      const resultado = window.confirm(`${title ? title + '\n\n' : ''}${message || ''}`);
      if (resultado) {
        // Acha o botão de confirmação (Geralmente o 'Sim', 'Excluir', 'Apagar' ou 'destructive')
        const btnConfirmar = buttons.find(b => b.style === 'destructive' || b.text?.toLowerCase().includes('sim') || b.text?.toLowerCase().includes('apagar'));
        if (btnConfirmar && btnConfirmar.onPress) btnConfirmar.onPress();
      } else {
        // Acha o botão de cancelar
        const btnCancelar = buttons.find(b => b.style === 'cancel' || b.text?.toLowerCase().includes('cancelar') || b.text?.toLowerCase().includes('não'));
        if (btnCancelar && btnCancelar.onPress) btnCancelar.onPress();
      }
    } 
    // Se for um alerta simples (apenas aviso e botão de OK)
    else {
      window.alert(`${title ? title + '\n\n' : ''}${message || ''}`);
      // Se o botão de OK tiver alguma função programada para rodar depois do alerta, ele roda aqui
      if (buttons && buttons.length === 1 && buttons[0].onPress) {
        buttons[0].onPress();
      }
    }
  };
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Agora o sistema sabe que existe uma tela separada só para o Login! */}
        <Stack.Screen name="login" /> 
        <Stack.Screen name="index" /> 
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}