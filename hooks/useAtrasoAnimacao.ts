import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { InteractionManager } from 'react-native';

// 1. Usado para telas normais (substitui o useEffect)
export function useAtrasoEffect(funcaoPesada: () => void) {
  useEffect(() => {
    const tarefa = InteractionManager.runAfterInteractions(() => {
      funcaoPesada();
    });
    return () => tarefa.cancel();
  }, []);
}

// 2. Usado para telas que precisam recarregar ao voltar pra elas (substitui o useFocusEffect)
export function useAtrasoFocus(funcaoPesada: () => void) {
  useFocusEffect(
    useCallback(() => {
      const tarefa = InteractionManager.runAfterInteractions(() => {
        funcaoPesada();
      });
      return () => tarefa.cancel();
    }, [])
  );
}