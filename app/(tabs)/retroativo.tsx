import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { router, useFocusEffect } from 'expo-router';
import React, { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, InteractionManager, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

const alertaWebMobile = (titulo: string, mensagem: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${titulo}\n\n${mensagem}`);
  } else {
    Alert.alert(titulo, mensagem);
  }
};

const confirmacaoWebMobile = (titulo: string, mensagem: string, aoConfirmar: () => void) => {
  if (Platform.OS === 'web') {
    const confirmado = window.confirm(`${titulo}\n\n${mensagem}`);
    if (confirmado) aoConfirmar();
  } else {
    Alert.alert(titulo, mensagem, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sim', style: 'destructive', onPress: aoConfirmar }
    ]);
  }
};

// 🟢 FUNÇÃO BLINDADA: Evita tela branca (crash) convertendo de forma segura qualquer tipo de dado
const converterParaNumero = (valor: any): number => {
  if (valor === null || valor === undefined || valor === '') return 0;
  const valorFormatado = String(valor).replace(',', '.');
  const numeroParsed = parseFloat(valorFormatado);
  return isNaN(numeroParsed) ? 0 : numeroParsed;
};

// =========================================================================
// COMPONENTE ISOLADO DE RELÓGIO
// =========================================================================
const Relogio = memo(({ onAtualizar }: { onAtualizar: () => void }) => {
  const [horaAtual, setHoraAtual] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setHoraAtual(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.relogioBox}>
      <Text style={styles.relogioTexto}>{horaAtual.toLocaleDateString('pt-BR')} - {horaAtual.toLocaleTimeString('pt-BR')}</Text>
      <TouchableOpacity onPress={onAtualizar} style={styles.btnAtualizar}>
        <Text style={styles.btnAtualizarText}>🔄 Atualizar Base de Dados</Text>
      </TouchableOpacity>
    </View>
  );
});

// =========================================================================
// TELA RETROATIVA
// =========================================================================
export default function RetroativoScreen() {
  const [colaborador, setColaborador] = useState('');
  const [servico, setServico] = useState('');
  const [servicoSelecionadoCompleto, setServicoSelecionadoCompleto] = useState<any>(null);
  
  // 👉 RECURSOS DA TELA PRINCIPAL
  const [tipoResina, setTipoResina] = useState('ELLIOTTI');
  const [ramaisSelecionados, setRamaisSelecionados] = useState<string[]>([]); 

  const [fazenda, setFazenda] = useState('');
  const [quadra, setQuadra] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [valorTotalCalculado, setValorTotalCalculado] = useState(0);

  // 👉 CAMPOS PARA O MODO RETROATIVO
  const [dataRetroativa, setDataRetroativa] = useState('');
  const [horaRetroativa, setHoraRetroativa] = useState('');
  
  const [listaColaboradores, setListaColaboradores] = useState<any[]>([]);
  const [listaServicos, setListaServicos] = useState<any[]>([]);
  const [mapaCompleto, setMapaCompleto] = useState<any[]>([]);
  const [fazendasDisponiveis, setFazendasDisponiveis] = useState<string[]>([]);
  const [quadrasDisponiveis, setQuadrasDisponiveis] = useState<string[]>([]);
  const [ramaisDisponiveis, setRamaisDisponiveis] = useState<any[]>([]);
  
  const [salvando, setSalvando] = useState(false);
  const [carregandoDados, setCarregandoDados] = useState(true);

  const [perfilLogado, setPerfilLogado] = useState<any>(null);
  const [lancamentosPendentes, setLancamentosPendentes] = useState<any[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  
  const [isOffline, setIsOffline] = useState(false);

  // ESTADOS DOS MODAIS E EDIÇÃO
  const [modalEquipeVisivel, setModalEquipeVisivel] = useState(false);
  const [modalPendentesVisivel, setModalPendentesVisivel] = useState(false);
  const [indexEdicao, setIndexEdicao] = useState<number | null>(null);
  const [dataOriginalEdicao, setDataOriginalEdicao] = useState<string | null>(null);

  // 👉 MELHORIA 1: InteractionManager PARA NÃO TRAVAR O MENU
  useFocusEffect(
    useCallback(() => {
      const tarefa = InteractionManager.runAfterInteractions(() => {
        carregarUsuarioLogado(); 
        carregarLancamentosLocais(); 
        
        if (indexEdicao === null) {
          const hoje = new Date();
          setDataRetroativa(hoje.toLocaleDateString('pt-BR'));
          setHoraRetroativa(hoje.toLocaleTimeString('pt-BR').substring(0, 5));
        }
      });
      return () => tarefa.cancel();
    }, [indexEdicao])
  );

  const carregarUsuarioLogado = async () => {
    try {
      const perfilSalvoStr = await AsyncStorage.getItem('@perfil_offline');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (session && !sessionError) {
        const { data: perfilData, error: perfilError } = await supabase.from('perfis').select('*').eq('id', session.user.id).single();
        if (perfilData && !perfilError) {
          setPerfilLogado(perfilData);
          await AsyncStorage.setItem('@perfil_offline', JSON.stringify(perfilData));
          carregarDadosBase();
          setIsOffline(false);
        } else acionarMochilaDePerfil(perfilSalvoStr);
      } else acionarMochilaDePerfil(perfilSalvoStr);
    } catch (e) {
      const perfilSalvoStr = await AsyncStorage.getItem('@perfil_offline');
      acionarMochilaDePerfil(perfilSalvoStr);
    }
  };

  const acionarMochilaDePerfil = (perfilSalvoStr: string | null) => {
    setIsOffline(true);
    if (perfilSalvoStr) {
      const p = JSON.parse(perfilSalvoStr);
      setPerfilLogado(p);
      carregarDadosBase();
    } else router.replace('/');
  };

  const carregarLancamentosLocais = async () => {
    try {
      const dados = await AsyncStorage.getItem('@lancamentos_off');
      if (dados) setLancamentosPendentes(JSON.parse(dados));
    } catch (e) {}
  };

  const carregarDadosBase = async () => {
    setCarregandoDados(true);
    try {
      const { data: colabs, error: errColab } = await supabase.from('colaboradores').select('*').order('nome');
      const { data: servs, error: errServ } = await supabase.from('servicos').select('*').neq('bloqueado', true).order('nome');
      
      // 👉 MELHORIA 2: BUSCA OTIMIZADA PARA NÃO ESTOURAR A MEMÓRIA
      const { data: mapa, error: errMapa } = await supabase.from('mapa_fazendas').select('fazenda, quadra, ramal, total_pes, data_bloqueio');

      if (errColab || errServ || errMapa) throw new Error("Sem rede");

      if (colabs) { setListaColaboradores(colabs); await AsyncStorage.setItem('@mochila_colaboradores', JSON.stringify(colabs)); }
      if (servs) { setListaServicos(servs); await AsyncStorage.setItem('@mochila_servicos', JSON.stringify(servs)); }
      if (mapa) {
        setMapaCompleto(mapa);
        setFazendasDisponiveis([...new Set(mapa.map(item => item.fazenda))] as string[]);
        await AsyncStorage.setItem('@mochila_mapa', JSON.stringify(mapa));
      }
      setIsOffline(false);
    } catch (error) {
      setIsOffline(true);
      const mochilaColabs = await AsyncStorage.getItem('@mochila_colaboradores');
      const mochilaServs = await AsyncStorage.getItem('@mochila_servicos');
      const mochilaMapa = await AsyncStorage.getItem('@mochila_mapa');

      if (mochilaColabs) setListaColaboradores(JSON.parse(mochilaColabs));
      if (mochilaServs) setListaServicos(JSON.parse(mochilaServs).filter((s: any) => s.bloqueado !== true));
      if (mochilaMapa) {
        const mapaParsed = JSON.parse(mochilaMapa);
        setMapaCompleto(mapaParsed);
        setFazendasDisponiveis([...new Set(mapaParsed.map((item: any) => item.fazenda))] as string[]);
      }
    }
    setCarregandoDados(false);
  };

  const atualizarMochilaManual = () => { carregarUsuarioLogado(); Alert.alert("Atualizando", "Buscando dados..."); };

  useEffect(() => {
    if (indexEdicao === null) {
      setQuadra(''); setRamaisSelecionados([]);
    }
    if (fazenda) setQuadrasDisponiveis([...new Set(mapaCompleto.filter(m => m.fazenda === fazenda).map(m => m.quadra))] as string[]);
    else setQuadrasDisponiveis([]);
  }, [fazenda, mapaCompleto]);

  useEffect(() => {
    if (indexEdicao === null) {
      setRamaisSelecionados([]);
    }
    if (quadra) {
      const ramaisDessaQuadra = mapaCompleto.filter(m => m.fazenda === fazenda && m.quadra === quadra);
      ramaisDessaQuadra.sort((a, b) => parseInt(a.ramal) - parseInt(b.ramal));
      setRamaisDisponiveis(ramaisDessaQuadra);
    } else {
      setRamaisDisponiveis([]);
    }
  }, [quadra, fazenda, mapaCompleto]);

  useEffect(() => {
    if (servicoSelecionadoCompleto && quantidade) {
      const qtdNum = converterParaNumero(quantidade);
      let valorUnitario = servicoSelecionadoCompleto.preco_base || 0;
      if (servicoSelecionadoCompleto.tipo_cobranca === 'milheiro') valorUnitario = valorUnitario / 1000;
      setValorTotalCalculado(qtdNum * valorUnitario);
    } else setValorTotalCalculado(0);
  }, [servicoSelecionadoCompleto, quantidade]);

  // 🟢 IDENTIFICADORES INTELIGENTES
  const isColeta = servicoSelecionadoCompleto?.nome?.toLowerCase().includes('coleta');
  const isCarregamentoResina = servico?.toUpperCase().includes('CARREGAMENTO DE RESINA');
  const permiteMultiplosRamais = servicoSelecionadoCompleto?.permite_multiplos === true || isColeta;

  // 🟢 CÁLCULO MÁGICO DOS PÉS
  const somaPesSelecionados = ramaisDisponiveis
    .filter(r => ramaisSelecionados.includes(String(r.ramal)))
    .reduce((acc, curr) => acc + (converterParaNumero(curr.total_pes) || 0), 0);
  
  const limitePesCalculado = somaPesSelecionados > 0 ? somaPesSelecionados : null;

  const toggleRamal = (ramalStr: string) => {
    if (permiteMultiplosRamais) {
      if (ramaisSelecionados.includes(ramalStr)) {
        setRamaisSelecionados(ramaisSelecionados.filter(r => r !== ramalStr));
      } else {
        setRamaisSelecionados([...ramaisSelecionados, ramalStr]);
      }
    } else {
      setRamaisSelecionados([ramalStr]);
    }
  };

  const selecionarTodosRamais = () => {
    setRamaisSelecionados(ramaisDisponiveis.map(r => String(r.ramal)));
  };

  // 👉 LÓGICA DE ALERTAS E TRAVA COM ESCUDO OFFLINE
  const handleMudancaQuantidade = (texto: string) => {
    const valorDigitado = converterParaNumero(texto);
    
    // Identificando o fiscal real para o alerta
    const dadosColab = listaColaboradores.find(c => c.nome === colaborador);
    const fiscalRealDaEquipe = dadosColab?.fiscal_vinculado || 'Não Identificado';

    if (!isCarregamentoResina && limitePesCalculado !== null && valorDigitado > limitePesCalculado) {
      if (!isOffline) {
        supabase.from('alertas_limite').insert([{
          colaborador: colaborador || 'Não Selecionado',
          fazenda: fazenda || 'Não Selecionada',
          quadra: quadra || 'Não Selecionada',
          ramal: ramaisSelecionados.join(', ') || 'Nenhum',
          servico: servico || 'Não Selecionado',
          quantidade_tentada: valorDigitado,
          limite_permitido: limitePesCalculado,
          fiscal_nome: fiscalRealDaEquipe,
          tipo_resina: isColeta ? tipoResina : null
        }]).then().catch(() => { console.log('Alerta bloqueado pela falta de rede'); }); 
      }
      Alert.alert("⚠️ Limite Excedido", "A quantidade informada é maior que o limite total permitido para o(s) ramal(is) selecionado(s).");
      setQuantidade(''); 
    } else {
      setQuantidade(texto);
    }
  };

  // 👉 MÁSCARAS PARA DATA E HORA RETROATIVAS
  const handleDataChange = (text: string) => {
    let v = text.replace(/\D/g, '');
    if (v.length > 2) v = v.replace(/^(\d{2})(\d)/, '$1/$2');
    if (v.length > 5) v = v.replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3');
    setDataRetroativa(v.substring(0, 10));
  };

  const handleHoraChange = (text: string) => {
    let v = text.replace(/\D/g, '');
    if (v.length > 2) v = v.replace(/^(\d{2})(\d)/, '$1:$2');
    setHoraRetroativa(v.substring(0, 5));
  };

  // 👉 PREPARAR EDIÇÃO COM TUDO INCLUSO
  const prepararEdicao = (index: number) => {
    const item = lancamentosPendentes[index];
    setColaborador(item.colaborador);
    setFazenda(item.fazenda);
    setQuadra(item.quadra && item.quadra !== '-' ? item.quadra : '');
    
    let nomePuroServico = item.servico;
    if (item.servico.includes(' - HÍBRIDO')) {
      nomePuroServico = item.servico.replace(' - HÍBRIDO', '');
      setTipoResina('HÍBRIDO');
    } else if (item.servico.includes(' - TROPICAL')) {
      nomePuroServico = item.servico.replace(' - TROPICAL', '');
      setTipoResina('TROPICAL');
    } else if (item.servico.includes(' - ELLIOTTI')) {
      nomePuroServico = item.servico.replace(' - ELLIOTTI', '');
      setTipoResina('ELLIOTTI');
    }

    setServico(nomePuroServico);
    setServicoSelecionadoCompleto(listaServicos.find(s => s.nome === nomePuroServico) || null);
    
    setTipoResina(item.tipo_resina || 'ELLIOTTI');
    
    if (item.ramal && item.ramal !== '-') {
      setRamaisSelecionados(String(item.ramal).split(', '));
    } else {
      setRamaisSelecionados([]);
    }
    
    setQuantidade(String(item.quantidade));

    // Extrai data e hora salvas e coloca de volta nos campos
    try {
      const [datePart, timePart] = item.data.split('T');
      const [ano, mes, dia] = datePart.split('-');
      setDataRetroativa(`${dia}/${mes}/${ano}`);
      setHoraRetroativa(timePart.substring(0, 5));
    } catch(e) {}

    setIndexEdicao(index);
    setDataOriginalEdicao(item.data); 
    setModalPendentesVisivel(false);
  };

  const cancelarEdicao = () => {
    setIndexEdicao(null);
    setDataOriginalEdicao(null);
    setServico('');
    setServicoSelecionadoCompleto(null);
    setTipoResina('ELLIOTTI');
    setRamaisSelecionados([]);
    setQuantidade('');
    setValorTotalCalculado(0);
  };

  const salvarLancamento = async () => {
    if (!colaborador || !servico || !fazenda || !quantidade || !dataRetroativa || !horaRetroativa) { 
      return Alert.alert("Aviso", "Preencha os campos principais, incluindo a Data e Hora!"); 
    }

    if (dataRetroativa.length !== 10) return Alert.alert("Erro", "Formato de data inválido. Use DD/MM/AAAA");
    if (horaRetroativa.length !== 5) return Alert.alert("Erro", "Formato de hora inválido. Use HH:MM");

    const [dia, mes, ano] = dataRetroativa.split('/');
    const hojeISO = `${ano}-${mes}-${dia}`;
    const dataIsoFinal = `${hojeISO}T${horaRetroativa}:00.000Z`;

    if (!isCarregamentoResina) {
      if (!quadra || ramaisSelecionados.length === 0) {
        return Alert.alert("Aviso", "Preencha a Quadra e o Ramal!");
      }
      
      for (let r of ramaisSelecionados) {
        const ramalInfo = mapaCompleto.find(m => m.fazenda === fazenda && m.quadra === quadra && String(m.ramal) === r);
        if (!ramalInfo) {
          return Alert.alert("❌ Erro", `O ramal ${r} não foi encontrado no mapa desta fazenda e quadra.`);
        }
        if (ramalInfo.data_bloqueio && hojeISO !== ramalInfo.data_bloqueio) { 
          return Alert.alert("📅 Data Bloqueada", `Ramal ${r} permitido apenas em: ${new Date(ramalInfo.data_bloqueio + 'T00:00:00').toLocaleDateString('pt-BR')}`); 
        }
      }

      if (limitePesCalculado !== null && converterParaNumero(quantidade) > limitePesCalculado) {
          setQuantidade('');
          return Alert.alert("⚠️ Limite Excedido", "A quantidade informada é maior que o limite total permitido para o(s) ramal(is) selecionado(s).");
      }
    }

    setSalvando(true);
    let valorUnitario = servicoSelecionadoCompleto?.preco_base || 0;
    if (servicoSelecionadoCompleto?.tipo_cobranca === 'milheiro') valorUnitario = valorUnitario / 1000;

    try {
      const numRamalFinal = isCarregamentoResina ? '-' : ramaisSelecionados.join(', ');
      const quadraFinal = isCarregamentoResina ? '-' : quadra;
      const nomeServicoFinalParaOBanco = isColeta ? `${servico} - ${tipoResina}` : servico;

      // 🟢 CORREÇÃO DO FISCAL: Pega sempre o oficial
      const dadosColab = listaColaboradores.find(c => c.nome === colaborador);
      const fiscalOficialDaEquipe = dadosColab?.fiscal_vinculado || 'Não Identificado';

      const novoLancamento = {
        colaborador, 
        servico: nomeServicoFinalParaOBanco, 
        fazenda, 
        quadra: quadraFinal, 
        ramal: numRamalFinal, 
        quantidade: converterParaNumero(quantidade), 
        valor_unitario: valorUnitario, 
        valor_total: valorTotalCalculado, 
        data: dataIsoFinal, 
        fiscal_nome: fiscalOficialDaEquipe,
        tipo_resina: isColeta ? tipoResina : null
      };

      let novaLista = [...lancamentosPendentes];
      
      if (indexEdicao !== null) {
        novaLista[indexEdicao] = novoLancamento; 
      } else {
        novaLista.push(novoLancamento); 
      }

      await AsyncStorage.setItem('@lancamentos_off', JSON.stringify(novaLista));
      setLancamentosPendentes(novaLista);

      setServico(''); 
      setServicoSelecionadoCompleto(null);
      setTipoResina('ELLIOTTI');
      setRamaisSelecionados([]); 
      setQuantidade(''); 
      setValorTotalCalculado(0);
      setIndexEdicao(null);
      setDataOriginalEdicao(null);
    } catch (e) {
      Alert.alert("Erro", "Não foi possível salvar no celular.");
    } finally {
      setSalvando(false);
    }
  };

  const sincronizarComBanco = async () => {
    if (lancamentosPendentes.length === 0) return;
    setSincronizando(true);

    try {
      const lancamentosProntosParaNuvem = lancamentosPendentes.map(item => {
        const { foto_local, foto_url, ...dados } = item;
        
        if (!dados.quadra || dados.quadra === null) dados.quadra = '-';
        if (!dados.ramal || dados.ramal === null) dados.ramal = '-';
        
        const colabRef = listaColaboradores.find(c => c.nome === dados.colaborador);
        if(colabRef && colabRef.fiscal_vinculado) {
             dados.fiscal_nome = colabRef.fiscal_vinculado;
        }

        return dados;
      });

      const tamanhoLote = 50;
      for (let i = 0; i < lancamentosProntosParaNuvem.length; i += tamanhoLote) {
        const lote = lancamentosProntosParaNuvem.slice(i, i + tamanhoLote);
        const { error: dbError } = await supabase.from('diarios_campo').insert(lote);
        if (dbError) throw dbError;
      }
      
      await AsyncStorage.removeItem('@lancamentos_off');
      setLancamentosPendentes([]);
      carregarDadosBase();
      Alert.alert("🚀 Sincronizado!", "Produções retroativas enviadas.");
    } catch (e: any) {
      Alert.alert("Erro na Sincronização", "Envio interrompido: " + e.message);
    } finally {
      setSincronizando(false);
    }
  };

  const excluirLancamentoPendente = async (index: number) => {
    Alert.alert(
      "Excluir Lançamento",
      "Tem certeza que deseja apagar este registro?",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Apagar", 
          style: "destructive",
          onPress: async () => {
            const novaLista = [...lancamentosPendentes];
            novaLista.splice(index, 1);
            await AsyncStorage.setItem('@lancamentos_off', JSON.stringify(novaLista));
            setLancamentosPendentes(novaLista);
            if (indexEdicao === index) cancelarEdicao();
          }
        }
      ]
    );
  };

  const loteAtualColaborador = lancamentosPendentes.filter(l => l.colaborador === colaborador);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{flex: 1}}>
        {isOffline && (
          <View style={styles.offlineBadge}>
            <Text style={styles.offlineText}>⚠️ MODO OFFLINE ATIVADO</Text>
          </View>
        )}

        <ScrollView style={styles.container} contentContainerStyle={{ flexGrow: 1, paddingBottom: 450 }} keyboardShouldPersistTaps="handled">
          
          <View style={styles.topBar}>
            {perfilLogado ? (
              <Text style={styles.userText}>👤 {perfilLogado.cargo}: {perfilLogado.nome}</Text>
            ) : (
              <Text style={styles.userText}>Buscando perfil...</Text>
            )}
            <TouchableOpacity onPress={() => setModalEquipeVisivel(true)} style={styles.btnEquipe}>
              <Text style={styles.btnEquipeText}>👥 Todos Colabs</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>Resinas Abud ⏳</Text>
            <Text style={styles.subtitle}>Lançamentos com data/hora manuais</Text>
            <Relogio onAtualizar={atualizarMochilaManual} />
          </View>

          {lancamentosPendentes.length > 0 && (
            <View style={styles.syncCard}>
              <Text style={styles.syncTexto}>📦 {lancamentosPendentes.length} no total aguardando envio</Text>
              <View style={styles.syncBotoesRow}>
                <TouchableOpacity style={styles.btnSyncVer} onPress={() => setModalPendentesVisivel(true)}>
                  <Text style={styles.btnSyncVerTexto}>✏️ VER / EDITAR</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnSync} onPress={sincronizarComBanco} disabled={sincronizando || indexEdicao !== null}>
                  {sincronizando ? <ActivityIndicator color="#F39C12" size="small" /> : <Text style={[styles.btnSyncTexto, indexEdicao !== null && {color: '#95A5A6'}]}>🚀 ENVIAR TUDO</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={[styles.card, indexEdicao !== null && { borderColor: '#F1C40F', borderWidth: 2 }]}>
            {carregandoDados ? (
              <ActivityIndicator size="large" color="#27AE60" />
            ) : (
              <>
                {indexEdicao !== null && (
                  <View style={styles.edicaoAviso}>
                    <Text style={styles.edicaoAvisoTexto}>⚠️ MODO DE EDIÇÃO ATIVADO</Text>
                  </View>
                )}

                <Text style={styles.label}>Colaborador:</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={colaborador} onValueChange={setColaborador} style={styles.picker}>
                    <Picker.Item label="Selecione o Colaborador..." value="" />
                    {listaColaboradores.map((item) => (<Picker.Item key={item.id} label={item.nome} value={item.nome} />))}
                  </Picker>
                </View>

                {/* 👉 BLOCO DE DATA E HORA RETROATIVAS (MANTIDOS LADO A LADO) */}
                <View style={[styles.rowData, { marginTop: 5, marginBottom: 10, padding: 10, backgroundColor: '#FEF9E7', borderRadius: 8, borderWidth: 1, borderColor: '#F1C40F' }]}>
                  <View style={styles.colData}>
                    <Text style={styles.label}>Data (Retroativa):</Text>
                    <TextInput 
                      style={[styles.input, { backgroundColor: '#FFF' }]} 
                      placeholder="DD/MM/AAAA" 
                      value={dataRetroativa} 
                      onChangeText={handleDataChange} 
                      keyboardType="numeric" 
                      maxLength={10}
                    />
                  </View>
                  <View style={styles.colData}>
                    <Text style={styles.label}>Hora Exata:</Text>
                    <TextInput 
                      style={[styles.input, { backgroundColor: '#FFF' }]} 
                      placeholder="HH:MM" 
                      value={horaRetroativa} 
                      onChangeText={handleHoraChange} 
                      keyboardType="numeric" 
                      maxLength={5}
                    />
                  </View>
                </View>

                {/* 👉 FAZENDA E QUADRA EM COLUNA PARA NÃO CORTAR TEXTO */}
                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={styles.label}>Fazenda:</Text>
                    <View style={styles.pickerContainer}>
                      <Picker selectedValue={fazenda} onValueChange={setFazenda} style={styles.picker}>
                        <Picker.Item label="..." value="" />
                        {fazendasDisponiveis.map((f, i) => (<Picker.Item key={i} label={f} value={f} />))}
                      </Picker>
                    </View>
                  </View>

                  <View style={styles.col}>
                    <Text style={styles.label}>Quadra:</Text>
                    <View style={[styles.pickerContainer, (!fazenda || isCarregamentoResina) && styles.disabled]}>
                      <Picker enabled={!!fazenda && !isCarregamentoResina} selectedValue={isCarregamentoResina ? "" : quadra} onValueChange={setQuadra} style={styles.picker}>
                        <Picker.Item label={isCarregamentoResina ? "Não exigida" : "..."} value="" />
                        {!isCarregamentoResina && quadrasDisponiveis.map((q, i) => (<Picker.Item key={i} label={q} value={q} />))}
                      </Picker>
                    </View>
                  </View>
                </View>

                <Text style={styles.label}>Serviço Feito:</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={servico} onValueChange={(v) => { setServico(v); setServicoSelecionadoCompleto(listaServicos.find(s => s.nome === v)); }} style={styles.picker}>
                    <Picker.Item label="Selecione o Serviço..." value="" />
                    {listaServicos.map((item) => (<Picker.Item key={item.id} label={item.nome} value={item.nome} />))}
                  </Picker>
                </View>

                {/* 👉 TIPO DE RESINA (SÓ APARECE SE FOR COLETA) */}
                {isColeta && (
                  <>
                    <Text style={styles.label}>Tipo de Resina (Coleta):</Text>
                    <View style={styles.pickerContainer}>
                      <Picker selectedValue={tipoResina} onValueChange={setTipoResina} style={styles.picker}>
                        <Picker.Item label="ELLIOTTI" value="ELLIOTTI" />
                        <Picker.Item label="TROPICAL" value="TROPICAL" />
                        <Picker.Item label="HÍBRIDO" value="HÍBRIDO" />
                      </Picker>
                    </View>
                  </>
                )}

                {!isCarregamentoResina && (
                  <>
                    <Text style={styles.label}>Ramal:</Text>
                    {!quadra ? (
                      <Text style={styles.textoDica}>Selecione a quadra primeiro para carregar os ramais.</Text>
                    ) : (
                      <View>
                        {permiteMultiplosRamais && (
                          <View style={{flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 5}}>
                            <TouchableOpacity onPress={selecionarTodosRamais} style={styles.btnSelecionarTodos}>
                              <Text style={styles.btnSelecionarTodosText}>✓ Todos da Quadra</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                        
                        <View style={styles.chipsContainer}>
                          {ramaisDisponiveis.map((r, i) => {
                            const rStr = String(r.ramal);
                            const selecionado = ramaisSelecionados.includes(rStr);
                            return (
                              <TouchableOpacity 
                                key={i} 
                                style={[styles.chip, selecionado && styles.chipSelecionado]} 
                                onPress={() => toggleRamal(rStr)}
                              >
                                <Text style={[styles.chipText, selecionado && styles.chipTextSelecionado]}>{rStr}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        {somaPesSelecionados > 0 && (
                          <TouchableOpacity 
                            style={styles.dicaPreenchimento} 
                            onPress={() => handleMudancaQuantidade(String(somaPesSelecionados))}
                          >
                            <Text style={styles.textoDicaPreenchimento}>
                              💡 Total do(s) ramal(is): <Text style={{fontWeight: 'bold'}}>{somaPesSelecionados} pés</Text>. Toque para preencher.
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </>
                )}

                <Text style={styles.label}>Quantidade Total (no lote selecionado):</Text>
                <TextInput 
                  style={[styles.inputQuantidade, !isCarregamentoResina && ramaisSelecionados.length === 0 && styles.disabledInput]} 
                  placeholder="Ex: 50" 
                  keyboardType="decimal-pad" 
                  value={quantidade} 
                  onChangeText={handleMudancaQuantidade} 
                  editable={isCarregamentoResina || ramaisSelecionados.length > 0} 
                />

                {valorTotalCalculado > 0 && (
                  <View style={styles.cardGanho}>
                    <Text style={styles.textoGanho}>Valor deste lançamento:</Text>
                    <Text style={styles.valorGanho}>R$ {valorTotalCalculado.toFixed(2).replace('.', ',')}</Text>
                  </View>
                )}

                {indexEdicao !== null ? (
                  <View style={styles.rowBotoesEdicao}>
                    <TouchableOpacity style={[styles.button, styles.btnCancelarEdicao]} onPress={cancelarEdicao}>
                      <Text style={styles.buttonText}>❌ CANCELAR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.button, styles.btnSalvarEdicao, salvando && styles.buttonDisabled]} onPress={salvarLancamento} disabled={salvando}>
                      {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>💾 SALVAR</Text>}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={[styles.button, salvando && styles.buttonDisabled]} onPress={salvarLancamento} disabled={salvando}>
                    {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>➕ ADICIONAR AO LOTE</Text>}
                  </TouchableOpacity>
                )}

                {colaborador !== '' && loteAtualColaborador.length > 0 && indexEdicao === null && (
                  <View style={styles.loteContainer}>
                    <Text style={styles.loteTitulo}>📝 Lote de {colaborador}:</Text>
                    {loteAtualColaborador.map((lote, index) => {
                      const dataVisor = lote.data.split('T')[0].split('-').reverse().join('/');
                      return (
                        <View key={index} style={styles.loteItem}>
                          <Ionicons name="checkmark-circle" size={16} color="#27AE60" style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.loteItemTextoBold}>
                              {lote.fazenda} {lote.quadra && lote.quadra !== '-' ? `- Q: ${lote.quadra}` : ''} <Text style={{color: '#E74C3C'}}>({dataVisor})</Text>
                            </Text>
                            <Text style={styles.loteItemTexto}>
                              {lote.servico} {lote.ramal && lote.ramal !== '-' ? `(R: ${lote.ramal})` : ''} ➔ {lote.quantidade} un
                            </Text>
                            {lote.tipo_resina && (
                              <Text style={[styles.loteItemTexto, {color: '#8E44AD', fontWeight: 'bold', fontSize: 11}]}>
                                Resina: {lote.tipo_resina}
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                    <Text style={styles.loteDica}>Pronto para adicionar outro ramal ou serviço!</Text>
                  </View>
                )}

              </>
            )}
          </View>
        </ScrollView>

        <Modal visible={modalEquipeVisivel} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Lista Geral ({listaColaboradores.length})</Text>
              <ScrollView style={{maxHeight: 400}}>
                {listaColaboradores.length === 0 ? (
                  <Text style={styles.textoVazio}>Ninguém cadastrado no sistema.</Text>
                ) : (
                  listaColaboradores.map(c => (
                    <View key={c.id} style={styles.itemEquipe}>
                      <Text style={styles.nomeEquipe}>👷 {c.nome}</Text>
                    </View>
                  ))
                )}
              </ScrollView>
              <TouchableOpacity style={styles.btnFecharModal} onPress={() => setModalEquipeVisivel(false)}>
                <Text style={styles.btnFecharTexto}>FECHAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={modalPendentesVisivel} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContentGrande}>
              <Text style={styles.modalTitle}>Lançamentos Pendentes</Text>
              <ScrollView style={{maxHeight: 500}}>
                {lancamentosPendentes.length === 0 ? (
                  <Text style={styles.textoVazio}>Nenhum lançamento offline.</Text>
                ) : (
                  lancamentosPendentes.map((item, index) => {
                    const dataPendente = item.data.split('T')[0].split('-').reverse().join('/');
                    return (
                      <View key={index} style={styles.itemPendente}>
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemColab}>{item.colaborador} - <Text style={{color: '#E74C3C', fontSize: 13}}>{dataPendente}</Text></Text>
                          <Text style={styles.itemDetalhes}>{item.fazenda} {item.quadra && item.quadra !== '-' ? `| Q: ${item.quadra}` : ''} {item.ramal && item.ramal !== '-' ? `| R: ${item.ramal}` : ''}</Text>
                          <Text style={styles.itemDetalhes}>
                            {item.servico} {item.tipo_resina ? `(${item.tipo_resina})` : ''} | Qtd: {item.quantidade} | R$ {item.valor_total.toFixed(2)}
                          </Text>
                        </View>
                        <View style={styles.itemAcoes}>
                          <TouchableOpacity style={styles.btnEditarPendente} onPress={() => prepararEdicao(index)}>
                            <Text style={styles.btnAcaoTexto}>✏️</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.btnApagarPendente} onPress={() => excluirLancamentoPendente(index)}>
                            <Text style={styles.btnAcaoTexto}>🗑️</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
              <TouchableOpacity style={styles.btnFecharModal} onPress={() => setModalPendentesVisivel(false)}>
                <Text style={styles.btnFecharTexto}>VOLTAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#F5F7FA', padding: 20 },
  offlineBadge: { backgroundColor: '#E74C3C', padding: 8, alignItems: 'center', justifyContent: 'center' },
  offlineText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, marginBottom: 5, backgroundColor: '#FFF', padding: 12, borderRadius: 8, elevation: 2 },
  userText: { fontSize: 13, fontWeight: 'bold', color: '#2C3E50', flex: 1 },
  btnEquipe: { backgroundColor: '#3498DB', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 5, marginRight: 8 },
  btnEquipeText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  header: { marginBottom: 20, marginTop: 10, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 16, color: '#7F8C8D', textAlign: 'center' },
  relogioBox: { backgroundColor: '#34495E', padding: 10, borderRadius: 8, marginTop: 15, alignItems: 'center', width: '100%' },
  relogioTexto: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  btnAtualizar: { backgroundColor: '#27AE60', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, marginTop: 10 },
  btnAtualizarText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  syncCard: { backgroundColor: '#F39C12', padding: 15, borderRadius: 12, marginBottom: 20, alignItems: 'center' },
  syncTexto: { color: '#FFF', fontWeight: 'bold', marginBottom: 10 },
  syncBotoesRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  btnSyncVer: { backgroundColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8, flex: 1, marginRight: 10, alignItems: 'center' },
  btnSyncVerTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  btnSync: { backgroundColor: '#FFF', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8, flex: 1, alignItems: 'center' },
  btnSyncTexto: { color: '#F39C12', fontWeight: 'bold', fontSize: 12 },
  card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 15, elevation: 5 },
  label: { fontSize: 14, fontWeight: '700', color: '#34495E', marginBottom: 5, marginTop: 15 },
  
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', overflow: 'hidden', height: 60, justifyContent: 'center' },
  picker: { height: 60, width: '100%' },
  
  disabled: { backgroundColor: '#EAECEE', opacity: 0.6 },
  
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5, marginBottom: 10 },
  chip: { backgroundColor: '#F8FAFC', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, borderWidth: 1, borderColor: '#D5DBDB' },
  chipSelecionado: { backgroundColor: '#2980B9', borderColor: '#2980B9' },
  chipText: { color: '#34495E', fontWeight: 'bold', fontSize: 16 },
  chipTextSelecionado: { color: '#FFF' },
  btnSelecionarTodos: { backgroundColor: '#27AE60', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  btnSelecionarTodosText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  textoDica: { color: '#7F8C8D', fontSize: 13, fontStyle: 'italic', marginTop: 5 },
  
  dicaPreenchimento: { backgroundColor: '#EBF5FB', padding: 10, borderRadius: 8, marginTop: 2, marginBottom: 15, borderWidth: 1, borderColor: '#AED6F1', alignItems: 'center' },
  textoDicaPreenchimento: { color: '#2980B9', fontSize: 12, fontStyle: 'italic' },

  inputQuantidade: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 12, fontSize: 18, backgroundColor: '#F8FAFC', height: 50 },
  disabledInput: { backgroundColor: '#EAECEE' },
  
  // 👉 NOVO: Estilo específico para Data e Hora ficarem lado a lado sem quebrar
  rowData: { flexDirection: 'row', justifyContent: 'space-between' },
  colData: { width: '48%' },

  // 👉 LAYOUT EM COLUNA PARA FAZENDA E QUADRA NÃO CORTAREM O TEXTO
  row: { flexDirection: 'column' },
  col: { width: '100%', marginBottom: 10 },
  
  input: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 12, fontSize: 18, backgroundColor: '#F8FAFC', height: 50 },
  
  cardGanho: { backgroundColor: '#E8F8F5', padding: 15, borderRadius: 10, marginTop: 20, alignItems: 'center', borderLeftWidth: 5, borderLeftColor: '#27AE60' },
  textoGanho: { color: '#1E8449', fontSize: 13, fontWeight: 'bold' },
  valorGanho: { color: '#1E8449', fontSize: 24, fontWeight: '900' },
  button: { backgroundColor: '#2980B9', padding: 18, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  buttonDisabled: { backgroundColor: '#95A5A6' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  
  edicaoAviso: { backgroundColor: '#FCF3CF', padding: 10, borderRadius: 8, marginBottom: 15, alignItems: 'center' },
  edicaoAvisoTexto: { color: '#D35400', fontWeight: 'bold', fontSize: 12 },
  rowBotoesEdicao: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  btnCancelarEdicao: { flex: 1, marginRight: 10, backgroundColor: '#E74C3C', marginTop: 0 },
  btnSalvarEdicao: { flex: 1, backgroundColor: '#27AE60', marginTop: 0 },

  loteContainer: { marginTop: 25, backgroundColor: '#F9EBEA', padding: 15, borderRadius: 10, borderLeftWidth: 4, borderLeftColor: '#E74C3C' },
  loteTitulo: { fontSize: 15, fontWeight: 'bold', color: '#C0392B', marginBottom: 10 },
  loteItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  loteItemTextoBold: { fontSize: 14, fontWeight: 'bold', color: '#2C3E50' },
  loteItemTexto: { fontSize: 13, color: '#34495E', marginTop: 2 },
  loteDica: { fontSize: 11, color: '#7F8C8D', fontStyle: 'italic', marginTop: 10, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', width: '100%', borderRadius: 15, padding: 20, elevation: 10 },
  modalContentGrande: { backgroundColor: '#FFF', width: '100%', borderRadius: 15, padding: 20, elevation: 10, flex: 0.9 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E50', marginBottom: 15, textAlign: 'center' },
  textoVazio: { textAlign: 'center', color: '#7F8C8D', marginVertical: 20 },
  itemEquipe: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#ECF0F1' },
  nomeEquipe: { fontSize: 16, color: '#34495E', fontWeight: 'bold' },
  itemPendente: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#D5DBDB', borderRadius: 8, padding: 12, marginBottom: 10, alignItems: 'center' },
  itemInfo: { flex: 1 },
  itemColab: { fontSize: 16, fontWeight: 'bold', color: '#2C3E50' },
  itemDetalhes: { fontSize: 13, color: '#7F8C8D', marginTop: 2 },
  itemAcoes: { flexDirection: 'row', gap: 10 },
  btnEditarPendente: { backgroundColor: '#F1C40F', padding: 10, borderRadius: 8 },
  btnApagarPendente: { backgroundColor: '#E74C3C', padding: 10, borderRadius: 8 },
  btnAcaoTexto: { fontSize: 16 },
  btnFecharModal: { backgroundColor: '#95A5A6', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  btnFecharTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 14 }
});