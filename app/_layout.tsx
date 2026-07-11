import 'react-native-gesture-handler'; // 👉 MÁGICA DO MENU LATERAL (LINHA 1 OBRIGATÓRIA)
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // 👉 ADICIONADO AQUI!

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Alert, Platform } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

// 👉 IMPORTAMOS O PRINT E SHARING PARA O SEQUESTRO GLOBAL DE PDF
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// Segura a tela de abertura até as fontes estarem 100% baixadas no navegador
SplashScreen.preventAutoHideAsync();

if (Platform.OS === 'web') {
  // ==========================================================
  // 1. SEQUESTRO GLOBAL DE ALERTAS PARA A WEB
  // ==========================================================
  Alert.alert = (title, message, buttons) => {
    if (buttons && buttons.length > 1) {
      const resultado = window.confirm(`${title ? title + '\n\n' : ''}${message || ''}`);
      if (resultado) {
        const btnConfirmar = buttons.find(b => b.style === 'destructive' || b.text?.toLowerCase().includes('sim') || b.text?.toLowerCase().includes('apagar'));
        if (btnConfirmar && btnConfirmar.onPress) btnConfirmar.onPress();
      } else {
        const btnCancelar = buttons.find(b => b.style === 'cancel' || b.text?.toLowerCase().includes('cancelar') || b.text?.toLowerCase().includes('não'));
        if (btnCancelar && btnCancelar.onPress) btnCancelar.onPress();
      }
    } else {
      window.alert(`${title ? title + '\n\n' : ''}${message || ''}`);
      if (buttons && buttons.length === 1 && buttons[0].onPress) {
        buttons[0].onPress();
      }
    }
  };

  // ==========================================================
  // 2. SEQUESTRO GLOBAL DE PDF PARA A WEB
  // ==========================================================
  const originalPrintToFileAsync = Print.printToFileAsync;
  
  // Intercepta a geração de PDF
  Print.printToFileAsync = async (options) => {
    if (options.html) {
      // Cria a tela de impressão do navegador silenciosamente
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(options.html);
        doc.close();
      }
      setTimeout(() => {
        if (iframe.contentWindow) {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        }
        setTimeout(() => { document.body.removeChild(iframe); }, 1000);
      }, 500);

      // Retorna uma URL "falsa" para o app achar que gerou o arquivo no celular
      return { uri: 'impressao-web-concluida', base64: '' };
    }
    return originalPrintToFileAsync(options);
  };

  const originalShareAsync = Sharing.shareAsync;
  
  // Intercepta o botão de compartilhar
  Sharing.shareAsync = async (url, options) => {
    // Se for a nossa URL falsa, ele não faz nada (pois o navegador já abriu a tela de imprimir)
    if (url === 'impressao-web-concluida') {
      return;
    }
    return originalShareAsync(url, options);
  };
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // 👉 A CORREÇÃO BLINDADA PARA OS ÍCONES: 
  // Forçando o Expo a empacotar os arquivos .ttf para dentro da pasta dist!
  const [loaded] = useFonts({
    Ionicons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'),
    MaterialCommunityIcons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'),
    'Material Design Icons': require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      // Assim que os ícones baixarem, ele libera a tela
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null; // Não mostra o app enquanto os ícones estiverem carregando
  }

  return (
    // 👉 ENVOLVENDO TUDO COM O GESTURE HANDLER AQUI NA RAIZ DO APP
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}