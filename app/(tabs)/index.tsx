import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { router, useFocusEffect } from 'expo-router';
import React, { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, InteractionManager, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
// TELA PRINCIPAL
// =========================================================================
export default function HomeScreen() {
  const [colaborador, setColaborador] = useState('');
  const [servico, setServico] = useState('');
  const [servicoSelecionadoCompleto, setServicoSelecionadoCompleto] = useState<any>(null);
  const [tipoResina, setTipoResina] = useState('ELLIOTTI');

  const [fazenda, setFazenda] = useState('');
  const [quadra, setQuadra] = useState('');
  
  const [ramaisSelecionados, setRamaisSelecionados] = useState<string[]>([]); 
  const [quantidade, setQuantidade] = useState('');
  const [valorTotalCalculado, setValorTotalCalculado] = useState(0);
  
  const [listaColaboradores, setListaColaboradores] = useState<any[]>([]);
  const [listaServicos, setListaServicos] = useState<any[]>([]);
  const [mapaCompleto, setMapaCompleto] = useState<any[]>([]);
  const [fazendasDisponiveis, setFazendasDisponiveis] = useState<string[]>([]);
  const [quadrasDisponiveis, setQuadrasDisponiveis] = useState<string[]>([]);
  const [ramaisDisponiveis, setRamaisDisponiveis] = useState<any[]>([]);
  const [limitePes, setLimitePes] = useState<number | null>(null);
  
  const [salvando, setSalvando] = useState(false);
  const [carregandoDados, setCarregandoDados] = useState(true);

  const [perfilLogado, setPerfilLogado] = useState<any>(null);
  const [lancamentosPendentes, setLancamentosPendentes] = useState<any[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  
  const [isOffline, setIsOffline] = useState(false);

  // Controle de Horário Permitido
  const [horaInicioPermitida, setHoraInicioPermitida] = useState('06:00');
  const [horaFimPermitida, setHoraFimPermitida] = useState('23:00');

  // ESTADOS DE EDIÇÃO
  const [modalPendentesVisivel, setModalPendentesVisivel] = useState(false);
  const [indexEdicao, setIndexEdicao] = useState<number | null>(null);
  const [dataOriginalEdicao, setDataOriginalEdicao] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const tarefa = InteractionManager.runAfterInteractions(() => {
        carregarUsuarioLogado(); 
        carregarLancamentosLocais(); 
      });
      return () => tarefa.cancel();
    }, [])
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
          carregarDadosBase(perfilData, session.user.id);
          setIsOffline(false);
        } else {
          acionarMochilaDePerfil(perfilSalvoStr);
        }
      } else {
        acionarMochilaDePerfil(perfilSalvoStr);
      }
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
      carregarDadosBase(p, p.id);
    } else {
      router.replace('/');
    }
  };

  const carregarLancamentosLocais = async () => {
    try {
      const dados = await AsyncStorage.getItem('@lancamentos_off');
      if (dados) setLancamentosPendentes(JSON.parse(dados));
    } catch (e) {
      console.log("Erro ao carregar dados locais");
    }
  };

  const carregarDadosBase = async (perfilLido: any, userIdLido: string | null) => {
    setCarregandoDados(true);
    try {
      let { data: colabs, error: errColab } = await supabase.from('colaboradores').select('*').order('nome');
      const { data: servs, error: errServ } = await supabase.from('servicos').select('*').neq('bloqueado', true).order('nome');
      // 👉 BUSCA OTIMIZADA APLICADA AQUI PARA NÃO ESTOURAR A MEMÓRIA!
      const { data: mapa, error: errMapa } = await supabase.from('mapa_fazendas').select('fazenda, quadra, ramal, total_pes, data_bloqueio');
      const { data: config, error: errConfig } = await supabase.from('configuracoes').select('*').single();

      if (errColab || errServ || errMapa) throw new Error("Sem rede");

      if (config) {
        setHoraInicioPermitida(config.hora_inicio);
        setHoraFimPermitida(config.hora_fim);
        await AsyncStorage.setItem('@config_horarios', JSON.stringify({ inicio: config.hora_inicio, fim: config.hora_fim }));
      }

      if (colabs) {
        if (perfilLido && perfilLido.cargo !== 'Administrador') {
          colabs = colabs.filter(c => 
            c.fiscal_vinculado === perfilLido.nome || 
            c.fiscal_id === perfilLido.id
          );
        }
        setListaColaboradores(colabs); 
        await AsyncStorage.setItem('@mochila_colaboradores', JSON.stringify(colabs)); 
      }
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
      const mochilaConfig = await AsyncStorage.getItem('@config_horarios');

      if (mochilaConfig) {
        const conf = JSON.parse(mochilaConfig);
        setHoraInicioPermitida(conf.inicio);
        setHoraFimPermitida(conf.fim);
      }
      if (mochilaColabs) setListaColaboradores(JSON.parse(mochilaColabs));
      if (mochilaServs) {
        const servicosMochila = JSON.parse(mochilaServs);
        setListaServicos(servicosMochila.filter((s: any) => s.bloqueado !== true));
      }
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
      setQuadra(''); setRamaisSelecionados([]); setLimitePes(null);
    }
    if (fazenda) setQuadrasDisponiveis([...new Set(mapaCompleto.filter(m => m.fazenda === fazenda).map(m => m.quadra))] as string[]);
    else setQuadrasDisponiveis([]);
  }, [fazenda, mapaCompleto]);

  useEffect(() => {
    if (indexEdicao === null) {
      setRamaisSelecionados([]); setLimitePes(null);
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
    if (ramaisSelecionados.length === 1) {
      const ramalSelecionado = ramaisDisponiveis.find(r => String(r.ramal) === ramaisSelecionados[0]);
      if (ramalSelecionado && ramalSelecionado.total_pes) {
        setLimitePes(ramalSelecionado.total_pes);
      } else {
        setLimitePes(null);
      }
    } else {
      setLimitePes(null);
    }
  }, [ramaisSelecionados, ramaisDisponiveis]);

  useEffect(() => {
    if (servicoSelecionadoCompleto && quantidade) {
      // 🟢 USANDO FUNÇÃO DE CONVERSÃO BLINDADA
      const qtdNum = converterParaNumero(quantidade);
      let valorUnitario = servicoSelecionadoCompleto.preco_base || 0;
      if (servicoSelecionadoCompleto.tipo_cobranca === 'milheiro') valorUnitario = valorUnitario / 1000;
      setValorTotalCalculado(qtdNum * valorUnitario);
    } else setValorTotalCalculado(0);
  }, [servicoSelecionadoCompleto, quantidade]);

  const isColeta = servicoSelecionadoCompleto?.nome?.toLowerCase().includes('coleta');
  
  const permiteMultiplosRamais = servicoSelecionadoCompleto?.permite_multiplos === true || isColeta;

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

  const handleMudancaQuantidade = (texto: string) => {
    // 🟢 USANDO FUNÇÃO DE CONVERSÃO BLINDADA
    const valorDigitado = converterParaNumero(texto);
    
    if (!permiteMultiplosRamais && limitePes !== null && valorDigitado > limitePes) {
      if (!isOffline) {
        supabase.from('alertas_limite').insert([{
          colaborador: colaborador || 'Não Selecionado',
          fazenda: fazenda || 'Não Selecionada',
          quadra: quadra || 'Não Selecionada',
          ramal: ramaisSelecionados.join(', ') || 'Nenhum',
          servico: servico || 'Não Selecionado',
          quantidade_tentada: valorDigitado,
          limite_permitido: limitePes,
          fiscal_nome: perfilLogado?.nome || 'Fiscal Não Identificado'
        }]).then(); 
      }
      Alert.alert("⚠️ Limite Excedido", "A quantidade informada é maior que o permitido para este ramal.");
      setQuantidade(''); 
    } else {
      setQuantidade(texto);
    }
  };

  const prepararEdicao = (index: number) => {
    const item = lancamentosPendentes[index];
    setColaborador(item.colaborador);
    setFazenda(item.fazenda);
    setQuadra(item.quadra);
    
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
    const servicoEncontrado = listaServicos.find(s => s.nome === nomePuroServico) || null;
    setServicoSelecionadoCompleto(servicoEncontrado);
    
    const ramaisArray = String(item.ramal).split(', ');
    setRamaisSelecionados(ramaisArray);
    
    setQuantidade(String(item.quantidade));
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
    if (!colaborador || !servico || !fazenda || !quadra || ramaisSelecionados.length === 0 || !quantidade) { 
      return Alert.alert("Aviso", "Preencha todos os campos!"); 
    }
    
    const dataMomento = new Date();
    const horaAtualMinutos = dataMomento.getHours() * 60 + dataMomento.getMinutes();
    
    const [horaIniStr, minIniStr] = horaInicioPermitida.split(':');
    const [horaFimStr, minFimStr] = horaFimPermitida.split(':');
    const minutosInicio = (parseInt(horaIniStr) * 60) + (parseInt(minIniStr) || 0);
    const minutosFim = (parseInt(horaFimStr) * 60) + (parseInt(minFimStr) || 0);

    if (horaAtualMinutos < minutosInicio || horaAtualMinutos > minutosFim) {
      return Alert.alert("🚫 Fora do Expediente", `Permitido apenas entre ${horaInicioPermitida} e ${horaFimPermitida}.`);
    }

    for (let r of ramaisSelecionados) {
      const ramalInfo = mapaCompleto.find(m => m.fazenda === fazenda && m.quadra === quadra && String(m.ramal) === r);
      if (!ramalInfo) {
        return Alert.alert("❌ Erro", `O ramal ${r} não foi encontrado no mapa desta fazenda e quadra.`);
      }
      if (ramalInfo.data_bloqueio) {
        const hojeISO = dataMomento.toISOString().split('T')[0];
        if (hojeISO !== ramalInfo.data_bloqueio) { 
          return Alert.alert("📅 Data Bloqueada", `Ramal ${r} permitido apenas em: ${new Date(ramalInfo.data_bloqueio + 'T00:00:00').toLocaleDateString('pt-BR')}`); 
        }
      }
    }

    // 🟢 USANDO FUNÇÃO DE CONVERSÃO BLINDADA NA CHECAGEM DE LIMITE
    if (!permiteMultiplosRamais && limitePes !== null && converterParaNumero(quantidade) > limitePes) {
        setQuantidade('');
        return Alert.alert("⚠️ Limite Excedido", "A quantidade informada é maior que o permitido para este ramal.");
    }

    setSalvando(true);
    let valorUnitario = servicoSelecionadoCompleto?.preco_base || 0;
    if (servicoSelecionadoCompleto?.tipo_cobranca === 'milheiro') valorUnitario = valorUnitario / 1000;

    try {
      const numRamalFinal = ramaisSelecionados.join(', ');
      const nomeServicoFinalParaOBanco = isColeta ? `${servico} - ${tipoResina}` : servico;

      const novoLancamento = {
        colaborador, 
        servico: nomeServicoFinalParaOBanco, 
        fazenda, 
        quadra, 
        ramal: numRamalFinal, 
        // 🟢 USANDO FUNÇÃO DE CONVERSÃO BLINDADA NO SALVAMENTO
        quantidade: converterParaNumero(quantidade), 
        valor_unitario: valorUnitario, 
        valor_total: valorTotalCalculado, 
        data: dataOriginalEdicao ? dataOriginalEdicao : dataMomento.toISOString(),
        fiscal_nome: perfilLogado?.nome || 'Fiscal Não Identificado' 
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
        return dados;
      });

      const tamanhoLote = 50;
      for (let i = 0; i < lancamentosProntosParaNuvem.length; i += tamanhoLote) {
        const lote = lancamentosProntosParaNuvem.slice(i, i + tamanhoLote);
        
        const { error: dbError } = await supabase.from('diarios_campo').insert(lote);
        if (dbError) throw new Error(`Falha no lote ${i}: ${dbError.message}`);
      }
      
      await AsyncStorage.removeItem('@lancamentos_off');
      setLancamentosPendentes([]);
      carregarDadosBase(perfilLogado, perfilLogado?.id || null);
      Alert.alert("🚀 Sincronizado com Sucesso!", "Todas as produções foram enviadas.");
      
    } catch (e: any) {
      Alert.alert("Erro na Sincronização", "A internet falhou no meio do envio. Tente novamente para enviar o restante: " + e.message);
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
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{flex: 1}}>
        {isOffline && (
          <View style={styles.offlineBadge}>
            <Text style={styles.offlineText}>⚠️ MODO OFFLINE ATIVADO - Lançamentos salvos no celular.</Text>
          </View>
        )}

        <ScrollView 
          style={styles.container} 
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 450 }} 
          keyboardShouldPersistTaps="handled"
        >
          
          <View style={styles.topBar}>
            {perfilLogado ? (
              <Text style={styles.userText}>👤 {perfilLogado.cargo}: {perfilLogado.nome}</Text>
            ) : (
              <Text style={styles.userText}>Buscando perfil...</Text>
            )}
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>Resinas Abud</Text>
            <Text style={styles.subtitle}>Lançamento de Produção</Text>
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

                <Text style={styles.label}>Colaborador da sua Equipe:</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={colaborador} onValueChange={setColaborador} style={styles.picker}>
                    <Picker.Item label="Selecione o Colaborador..." value="" />
                    {listaColaboradores.map((item) => (<Picker.Item key={item.id} label={item.nome} value={item.nome} />))}
                  </Picker>
                </View>

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
                    <View style={[styles.pickerContainer, !fazenda && styles.disabled]}>
                      <Picker enabled={!!fazenda} selectedValue={quadra} onValueChange={setQuadra} style={styles.picker}>
                        <Picker.Item label="..." value="" />
                        {quadrasDisponiveis.map((q, i) => (<Picker.Item key={i} label={q} value={q} />))}
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
                  </View>
                )}

                <Text style={styles.label}>Quantidade Total (no lote selecionado):</Text>
                <TextInput 
                  style={[styles.inputQuantidade, ramaisSelecionados.length === 0 && styles.disabledInput]} 
                  placeholder="Ex: 50" 
                  keyboardType="decimal-pad" 
                  value={quantidade} 
                  onChangeText={handleMudancaQuantidade} 
                  editable={ramaisSelecionados.length > 0} 
                />

                {valorTotalCalculado > 0 && (
                  <View style={styles.cardGanho}>
                    <Text style={styles.textoGanho}>Valor deste lançamento:</Text>
                    <Text style={styles.valorGanho}>R$ {Number(valorTotalCalculado).toFixed(2).replace('.', ',')}</Text>
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
                    {loteAtualColaborador.map((lote, index) => (
                      <View key={index} style={styles.loteItem}>
                        <Ionicons name="checkmark-circle" size={16} color="#27AE60" style={{ marginTop: 2 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.loteItemTextoBold}>
                            {lote.fazenda} - Q: {lote.quadra}
                          </Text>
                          <Text style={styles.loteItemTexto}>
                            {lote.servico} (R: {lote.ramal}) ➔ {lote.quantidade} un
                          </Text>
                        </View>
                      </View>
                    ))}
                    <Text style={styles.loteDica}>Pronto para adicionar outro ramal ou serviço!</Text>
                  </View>
                )}

              </>
            )}
          </View>
        </ScrollView>

        <Modal visible={modalPendentesVisivel} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContentGrande}>
              <Text style={styles.modalTitle}>Lançamentos Pendentes</Text>
              
              {lancamentosPendentes.length === 0 ? (
                <Text style={styles.textoVazio}>Nenhum lançamento offline.</Text>
              ) : (
                <FlatList
                  style={{ maxHeight: 500 }}
                  data={lancamentosPendentes}
                  keyExtractor={(item, index) => index.toString()}
                  initialNumToRender={10}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                  removeClippedSubviews={true}
                  renderItem={({ item, index }) => (
                    <View style={styles.itemPendente}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemColab}>{item.colaborador}</Text>
                        <Text style={styles.itemDetalhes}>{item.fazenda} | Q: {item.quadra} | R: {item.ramal}</Text>
                        <Text style={styles.itemDetalhes}>{item.servico} | Qtd: {item.quantidade} | R$ {Number(item.valor_total).toFixed(2)}</Text>
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
                  )}
                />
              )}

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
  topBar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 15, marginBottom: 5, backgroundColor: '#FFF', padding: 12, borderRadius: 8, elevation: 2 },
  userText: { fontSize: 14, fontWeight: 'bold', color: '#2C3E50', textAlign: 'center' },
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
  
  inputQuantidade: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 12, fontSize: 18, backgroundColor: '#F8FAFC', height: 50 },
  disabledInput: { backgroundColor: '#EAECEE' },
  
  row: { flexDirection: 'row' },
  col: { flex: 1, marginHorizontal: 5 },
  
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
  modalContentGrande: { backgroundColor: '#FFF', width: '100%', borderRadius: 15, padding: 20, elevation: 10, flex: 0.9 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E50', marginBottom: 15, textAlign: 'center' },
  textoVazio: { textAlign: 'center', color: '#7F8C8D', marginVertical: 20 },
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