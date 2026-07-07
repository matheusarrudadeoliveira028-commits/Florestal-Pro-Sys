import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Drawer } from 'expo-router/drawer';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '../../src/supabase';

export default function DrawerLayout() {
  const { width } = useWindowDimensions();
  const isTelaGrande = width >= 768;

  const [isAdmin, setIsAdmin] = useState(false);
  const [permissoesAtivas, setPermissoesAtivas] = useState<any>({});
  const [carregandoMenu, setCarregandoMenu] = useState(true);

  useEffect(() => {
    carregarRegras();
  }, []);

  const carregarRegras = async () => {
    try {
      const perfilSalvo = await AsyncStorage.getItem('@perfil_offline');
      if (!perfilSalvo) {
        setCarregandoMenu(false);
        return;
      }

      const perfil = JSON.parse(perfilSalvo);
      const cargoDoUsuario = perfil.cargo ? perfil.cargo.trim() : '';
      const ehAdmin = cargoDoUsuario.toLowerCase() === 'administrador';
      
      setIsAdmin(ehAdmin);

      if (!ehAdmin && cargoDoUsuario) {
        const { data, error } = await supabase.from('permissoes_menu').select('*');
        
        if (data) {
          const regraDoCargo = data.find(item => item.cargo && item.cargo.toLowerCase() === cargoDoUsuario.toLowerCase());
          
          if (regraDoCargo && regraDoCargo.telas) {
            const regras = typeof regraDoCargo.telas === 'string' ? JSON.parse(regraDoCargo.telas) : regraDoCargo.telas;
            setPermissoesAtivas(regras);
          } else {
            Alert.alert(
              "Aviso de Acesso", 
              `Nenhuma regra de menu encontrada para o seu cargo: "${cargoDoUsuario}". \nPeça ao Administrador para configurar no Painel.`
            );
          }
        }
      }
    } catch (e) {
      console.log("Erro ao carregar regras de acesso do menu");
    } finally {
      setCarregandoMenu(false);
    }
  };

  const ocultarVisul = (chaveTela: string) => {
    if (isAdmin) return {}; 
    
    if (permissoesAtivas[chaveTela] === true || permissoesAtivas[chaveTela] === "true") {
      return {}; 
    }
    
    return { display: 'none' as const }; 
  };

  if (carregandoMenu) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#2C3E50' }}>
        <ActivityIndicator size="large" color="#27AE60" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        screenOptions={{
          drawerType: isTelaGrande ? 'permanent' : 'front',
          drawerStyle: {
            width: isTelaGrande ? 280 : 250,
          },
          headerStyle: { backgroundColor: '#2C3E50' },
          headerTintColor: '#FFF',
          headerTitleStyle: { fontWeight: 'bold' },
          drawerActiveBackgroundColor: '#27AE60',
          drawerActiveTintColor: '#FFF',
          drawerInactiveTintColor: '#34495E',
          drawerLabelStyle: { 
            fontSize: 16, 
            fontWeight: 'bold',
            textTransform: 'capitalize' 
          }
        }}
      >
        
        <Drawer.Screen
          name="index"
          options={{
            drawerLabel: 'Lançar Produção',
            title: 'Início',
            drawerIcon: ({ color, size }) => <Ionicons name="leaf" size={size} color={color} />,
          }}
        />

        <Drawer.Screen
          name="estoque"
          options={{
            drawerLabel: 'Estoque / Inventário',
            title: 'Estoque',
            drawerIcon: ({ color, size }) => <Ionicons name="cube" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('estoque')
          }}
        />

        <Drawer.Screen
          name="carregamentos"
          options={{
            drawerLabel: 'Expedição / Romaneio',
            title: 'Carregamentos',
            drawerIcon: ({ color, size }) => <MaterialCommunityIcons name="truck" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('carregamentos') // 👉 CORRIGIDO AQUI!
          }}
        />

        <Drawer.Screen
          name="diarios"
          options={{
            drawerLabel: 'Diário Reserva',
            title: 'Diário',
            drawerIcon: ({ color, size }) => <MaterialCommunityIcons name="book-open-page-variant" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('diarios') // 👉 CORRIGIDO AQUI!
          }}
        />

        <Drawer.Screen
          name="retroativo"
          options={{
            drawerLabel: 'Lançamento Retroativo',
            title: 'Exceções',
            drawerIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('retroativo') // 👉 CORRIGIDO AQUI!
          }}
        />

        <Drawer.Screen
          name="mapa"
          options={{
            drawerLabel: 'Mapa Da Fazenda',
            title: 'Mapa',
            drawerIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('mapa')
          }}
        />

        <Drawer.Screen
          name="auditoria"
          options={{
            drawerLabel: 'Auditoria De Fotos',
            title: 'Auditoria',
            drawerIcon: ({ color, size }) => <Ionicons name="camera" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('auditoria')
          }}
        />

        <Drawer.Screen
          name="alertas"
          options={{
            drawerLabel: 'Auditoria de Alertas',
            title: 'Alertas',
            drawerIcon: ({ color, size }) => <Ionicons name="warning" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('alertas')
          }}
        />

        <Drawer.Screen
          name="fechamento"
          options={{
            drawerLabel: 'Fechamento Financeiro',
            title: 'Financeiro',
            drawerIcon: ({ color, size }) => <Ionicons name="cash" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('fechamento')
          }}
        />

        <Drawer.Screen
          name="usuarios"
          options={{
            drawerLabel: 'Gestão De Acessos',
            title: 'Acessos',
            drawerIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('usuarios')
          }}
        />

        <Drawer.Screen
          name="estatisticas"
          options={{
            drawerLabel: 'Estatísticas De Produção',
            title: 'Dashboard',
            drawerIcon: ({ color, size }) => <Ionicons name="bar-chart" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('estatisticas')
          }}
        />

        <Drawer.Screen
          name="ferias"
          options={{
            drawerLabel: 'Férias',
            title: 'Férias',
            drawerIcon: ({ color, size }) => <Ionicons name="airplane" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('ferias')
          }}
        />

        <Drawer.Screen
          name="equipes"
          options={{
            drawerLabel: 'Equipes',
            title: 'Equipes',
            drawerIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('equipes')
          }}
        />

        <Drawer.Screen
          name="suporte"
          options={{
            drawerLabel: 'Suporte',
            title: 'Suporte',
            drawerIcon: ({ color, size }) => <Ionicons name="compass" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('suporte')
          }}
        />

        <Drawer.Screen
          name="ausencias"
          options={{
            drawerLabel: 'Ausências',
            title: 'Ausências',
            drawerIcon: ({ color, size }) => <Ionicons name="close-circle-outline" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('ausencias')
          }}
        />

        <Drawer.Screen
          name="cadastros"
          options={{
            drawerLabel: 'Cadastros',
            title: 'Cadastros',
            drawerIcon: ({ color, size }) => <Ionicons name="document-text" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('cadastros')
          }}
        />

        <Drawer.Screen
          name="relatorios"
          options={{
            drawerLabel: 'Relatórios',
            title: 'Relatórios',
            drawerIcon: ({ color, size }) => <Ionicons name="document-attach" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('relatorios')
          }}
        />

        <Drawer.Screen
          name="colaboradores"
          options={{
            drawerLabel: 'Colaboradores',
            title: 'Colaboradores',
            drawerIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
            drawerItemStyle: ocultarVisul('colaboradores')
          }}
        />

        <Drawer.Screen
          name="permissoes"
          options={{
            drawerLabel: 'Gerenciar Permissões',
            title: 'Controle de Menu',
            drawerIcon: ({ color, size }) => <MaterialCommunityIcons name="shield-key" size={size} color={color} />,
            drawerItemStyle: isAdmin ? {} : { display: 'none' } 
          }}
        />

        <Drawer.Screen
          name="configuracoes"
          options={{
            drawerLabel: 'Configurações / Sair',
            title: 'Ajustes',
            drawerIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
          }}
        />

      </Drawer>
    </GestureHandlerRootView>
  );
}