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

const converterParaNumero = (valor: any): number => {
  if (valor === null || valor === undefined || valor === '') return 0;
  const valorFormatado = String(valor).replace(',', '.');
  const numeroParsed = parseFloat(valorFormatado);
  return isNaN(numeroParsed) ? 0 : numeroParsed;
};

const arredondarMoeda = (valor: number): number => {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
};

const normalizarTexto = (txt: any) => {
  if (!txt) return '';
  return String(txt).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, ' ').trim();
};

const limparTextoExibicao = (txt: any) => {
  if (!txt) return '';
  return String(txt).replace(/\s+/g, ' ').trim();
};

// 🟢 DATA LOCAL DO BRASIL (Evita pular para o dia seguinte após as 21h por causa do fuso UTC)
const obterDataHojeLocalISO = (d: Date = new Date()) => {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
};

// 🟢 BUSCA PAGINADA COMPLETA (Burla o limite de 1.000 linhas do Supabase)
const buscarTodasAsLinhas = async (tabela: string, colunaOrdem: string = 'id') => {
  let todosOsDados: any[] = [];
  const limite = 1000;
  let inicio = 0;
  let buscando = true;

  while (buscando) {
    const { data, error } = await supabase
      .from(tabela)
      .select('*')
      .order(colunaOrdem, { ascending: true })
      .range(inicio, inicio + limite - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      todosOsDados = [...todosOsDados, ...data];
      if (data.length < limite) {
        buscando = false;
      } else {
        inicio += limite;
      }
    } else {
      buscando = false;
    }
  }
  return todosOsDados;
};

const calcularSimilaridade = (str1: string, str2: string): number => {
  const limpo1 = normalizarTexto(str1).replace(/[^A-Z0-9 ]/g, '');
  const limpo2 = normalizarTexto(str2).replace(/[^A-Z0-9 ]/g, '');
  
  const palavras1 = limpo1.split(/\s+/).map(p => p.replace(/S$/, ''));
  const palavras2 = limpo2.split(/\s+/).map(p => p.replace(/S$/, ''));
  
  let match = 0;
  palavras1.forEach(p1 => {
    if (p1.length > 0 && palavras2.includes(p1)) match++;
  });
  return match;
};

const Relogio = memo(({ onAtualizar }: { onAtualizar: () => void }) => {
  const [horaAtual, setHoraAtual] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setHoraAtual(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.relogioBox}>
      <Text style={styles.relogioTexto}>
        {horaAtual.toLocaleDateString('pt-BR')} - {horaAtual.toLocaleTimeString('pt-BR')}
      </Text>
      <TouchableOpacity onPress={onAtualizar} style={styles.btnAtualizar}>
        <Text style={styles.btnAtualizarText}>🔄 Atualizar Base de Dados</Text>
      </TouchableOpacity>
    </View>
  );
});

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
  const [servicosFiltrados, setServicosFiltrados] = useState<any[]>([]);
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

  const [horaInicioPermitida, setHoraInicioPermitida] = useState('06:00');
  const [horaFimPermitida, setHoraFimPermitida] = useState('23:00');

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
        const { data: perfilData, error: perfilError } = await supabase
          .from('perfis')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();
        
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

  // Higieniza os textos do mapa para evitar que espaços em branco escondam quadras ou ramais
  const higienizarListaMapa = (lista: any[]) => {
    return lista.map(item => ({
      ...item,
      fazenda: limparTextoExibicao(item.fazenda),
      quadra: limparTextoExibicao(item.quadra),
      ramal: limparTextoExibicao(item.ramal),
      servico_permitido: item.servico_permitido ? limparTextoExibicao(item.servico_permitido) : null
    }));
  };

  const carregarDadosBase = async (perfilLido: any, userIdLido: string | null) => {
    setCarregandoDados(true);
    try {
      let admin = false;
      let permitidas: string[] = [];

      if (perfilLido) {
        const cargoLimpo = perfilLido.cargo ? normalizarTexto(perfilLido.cargo) : '';
        admin = (cargoLimpo === 'ADMINISTRADOR' || cargoLimpo === 'SUPERVISOR');
        
        if (perfilLido.fazendas_permitidas) {
          permitidas = Array.isArray(perfilLido.fazendas_permitidas) 
            ? perfilLido.fazendas_permitidas.map((f: string) => normalizarTexto(f))
            : String(perfilLido.fazendas_permitidas).split(',').map((f: string) => normalizarTexto(f));
        }
      }

      const [
        colabsBrutos,
        { data: servs, error: errServ },
        mapaBruto,
        { data: config }
      ] = await Promise.all([
        buscarTodasAsLinhas('colaboradores', 'nome'),
        supabase.from('servicos').select('*').neq('bloqueado', true).order('nome'),
        buscarTodasAsLinhas('mapa_fazendas', 'id'),
        supabase.from('configuracoes').select('*').maybeSingle()
      ]);

      if (errServ) throw new Error("Sem rede");

      if (config) {
        if (config.hora_inicio) setHoraInicioPermitida(config.hora_inicio);
        if (config.hora_fim) setHoraFimPermitida(config.hora_fim);
        await AsyncStorage.setItem('@config_horarios', JSON.stringify({ 
          inicio: config.hora_inicio || '06:00', 
          fim: config.hora_fim || '23:00' 
        }));
      }

      if (colabsBrutos) {
        let colabs = colabsBrutos;
        if (!admin && perfilLido) {
          const nomeFiscalNorm = normalizarTexto(perfilLido.nome);
          colabs = colabs.filter(c => 
            normalizarTexto(c.fiscal_vinculado) === nomeFiscalNorm || 
            c.fiscal_id === perfilLido.id
          );
        }
        setListaColaboradores(colabs); 
        await AsyncStorage.setItem('@mochila_colaboradores', JSON.stringify(colabs)); 
      }
      
      if (servs) { 
        setListaServicos(servs); 
        setServicosFiltrados(servs); 
        await AsyncStorage.setItem('@mochila_servicos', JSON.stringify(servs)); 
      }
      
      if (mapaBruto) {
        const mapaLimpo = higienizarListaMapa(mapaBruto);
        const mapaFiltrado = mapaLimpo.filter(item => {
          if (admin || permitidas.length === 0) return true;
          const fazNorm = normalizarTexto(item.fazenda);
          return permitidas.some(p => fazNorm.includes(p) || p.includes(fazNorm));
        });

        setMapaCompleto(mapaFiltrado);
        const fazendasUnicas = [...new Set(mapaFiltrado.map(item => item.fazenda))].filter(Boolean) as string[];
        fazendasUnicas.sort((a, b) => a.localeCompare(b));
        setFazendasDisponiveis(fazendasUnicas);
        await AsyncStorage.setItem('@mochila_mapa', JSON.stringify(mapaFiltrado));
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
        if (conf.inicio) setHoraInicioPermitida(conf.inicio);
        if (conf.fim) setHoraFimPermitida(conf.fim);
      }
      if (mochilaColabs) setListaColaboradores(JSON.parse(mochilaColabs));
      
      if (mochilaServs) {
        const servicosMochila = JSON.parse(mochilaServs).filter((s: any) => s.bloqueado !== true);
        setListaServicos(servicosMochila);
        setServicosFiltrados(servicosMochila);
      }
      
      if (mochilaMapa) {
        let admin = false;
        let permitidas: string[] = [];

        if (perfilLido) {
          const cargoLimpo = perfilLido.cargo ? normalizarTexto(perfilLido.cargo) : '';
          admin = (cargoLimpo === 'ADMINISTRADOR' || cargoLimpo === 'SUPERVISOR');
          if (perfilLido.fazendas_permitidas) {
            permitidas = Array.isArray(perfilLido.fazendas_permitidas) 
              ? perfilLido.fazendas_permitidas.map((f: string) => normalizarTexto(f))
              : String(perfilLido.fazendas_permitidas).split(',').map((f: string) => normalizarTexto(f));
          }
        }

        const mapaParsed = higienizarListaMapa(JSON.parse(mochilaMapa));
        const mapaFiltrado = mapaParsed.filter((item: any) => {
          if (admin || permitidas.length === 0) return true;
          const fazNorm = normalizarTexto(item.fazenda);
          return permitidas.some(p => fazNorm.includes(p) || p.includes(fazNorm));
        });

        setMapaCompleto(mapaFiltrado);
        const fazendasUnicas = [...new Set(mapaFiltrado.map((item: any) => item.fazenda))].filter(Boolean) as string[];
        fazendasUnicas.sort((a, b) => a.localeCompare(b));
        setFazendasDisponiveis(fazendasUnicas);
      }
    }
    setCarregandoDados(false);
  };

  const atualizarMochilaManual = () => { 
    carregarUsuarioLogado(); 
    alertaWebMobile("Atualizando", "Buscando dados atualizados do servidor..."); 
  };

  // Atualiza a lista de quadras disponíveis quando a fazenda muda
  useEffect(() => {
    if (fazenda) {
      const quadras = [...new Set(mapaCompleto.filter(m => m.fazenda === fazenda).map(m => m.quadra))].filter(Boolean) as string[];
      quadras.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      setQuadrasDisponiveis(quadras);
    } else {
      setQuadrasDisponiveis([]);
    }
  }, [fazenda, mapaCompleto]);

  // Atualiza a lista de ramais disponíveis quando a quadra muda
  useEffect(() => {
    if (fazenda && quadra) {
      const ramaisDessaQuadra = mapaCompleto.filter(m => m.fazenda === fazenda && m.quadra === quadra);
      
      const ramaisUnicosMap = new Map();
      ramaisDessaQuadra.forEach(r => {
        const rStr = String(r.ramal);
        if (!ramaisUnicosMap.has(rStr)) {
          ramaisUnicosMap.set(rStr, r);
        }
      });
      
      const ramaisUnicos = Array.from(ramaisUnicosMap.values());
      ramaisUnicos.sort((a: any, b: any) => String(a.ramal).localeCompare(String(b.ramal), undefined, { numeric: true }));
      setRamaisDisponiveis(ramaisUnicos);
    } else {
      setRamaisDisponiveis([]);
    }
  }, [quadra, fazenda, mapaCompleto]);

  // Filtra os serviços permitidos para a fazenda selecionada
  useEffect(() => {
    if (!fazenda) {
      setServicosFiltrados(listaServicos);
      return;
    }

    const fazendaNorm = normalizarTexto(fazenda);
    
    const filtrados = listaServicos.filter(s => {
      if (!s.fazendas_permitidas) return true;

      let permitidas: string[] = [];
      if (Array.isArray(s.fazendas_permitidas)) {
        permitidas = s.fazendas_permitidas.map((f: string) => normalizarTexto(f));
      } else {
        permitidas = String(s.fazendas_permitidas).split(',').map((f: string) => normalizarTexto(f));
      }

      return permitidas.some(p => fazendaNorm.includes(p) || p.includes(fazendaNorm));
    });

    setServicosFiltrados(filtrados);

    if (servico && !filtrados.find(s => s.nome === servico)) {
      setServico('');
      setServicoSelecionadoCompleto(null);
    }
  }, [fazenda, listaServicos]);

  // Calcula o valor total em R$
  useEffect(() => {
    if (servicoSelecionadoCompleto && quantidade) {
      const qtdNum = converterParaNumero(quantidade);
      let valorUnitario = Number(servicoSelecionadoCompleto.preco_base) || 0;
      if (servicoSelecionadoCompleto.tipo_cobranca === 'milheiro') valorUnitario = valorUnitario / 1000;
      setValorTotalCalculado(arredondarMoeda(qtdNum * valorUnitario));
    } else {
      setValorTotalCalculado(0);
    }
  }, [servicoSelecionadoCompleto, quantidade]);

  const isColeta = servicoSelecionadoCompleto?.nome?.toLowerCase().includes('coleta') || servico?.toLowerCase().includes('coleta');
  const isCarregamentoResina = servico?.toUpperCase().includes('CARREGAMENTO DE RESINA');
  const permiteMultiplosRamais = servicoSelecionadoCompleto?.permite_multiplos === true || isColeta;
  
  const isServicoCoringa = servicoSelecionadoCompleto?.is_coringa === true || 
                           String(servicoSelecionadoCompleto?.is_coringa).toLowerCase() === 'sim' || 
                           String(servicoSelecionadoCompleto?.is_coringa).toLowerCase() === 'true' ||
                           servicoSelecionadoCompleto?.is_coringa === 1;

  let capacidadesDisponiveis: { servico: string, total: number }[] = [];
  let limitePesCalculado: number | null = null;

  if (ramaisSelecionados.length > 0) {
    const cadastrosSelecionados = mapaCompleto.filter(m => 
      m.fazenda === fazenda && 
      m.quadra === quadra && 
      ramaisSelecionados.includes(String(m.ramal))
    );

    const mapaServicos = new Map<string, number>();
    cadastrosSelecionados.forEach(cad => {
      const nomeSrv = cad.servico_permitido ? String(cad.servico_permitido).trim() : 'Livre';
      const pes = converterParaNumero(cad.total_pes);
      mapaServicos.set(nomeSrv, (mapaServicos.get(nomeSrv) || 0) + pes);
    });

    mapaServicos.forEach((total, srv) => {
      capacidadesDisponiveis.push({ servico: srv, total });
    });

    const servicoFormatado = String(servico).trim().toUpperCase();
    let matchedTotal = 0;
    
    for (let cap of capacidadesDisponiveis) {
      if (cap.servico.toUpperCase() === servicoFormatado) {
        matchedTotal = cap.total;
        break;
      }
    }
    
    if (matchedTotal === 0) {
      let maiorPontuacao = -1;
      for (let cap of capacidadesDisponiveis) {
        if (cap.servico !== 'Livre') {
          const score = calcularSimilaridade(servicoFormatado, cap.servico);
          if (score > maiorPontuacao && score > 0) {
            maiorPontuacao = score;
            matchedTotal = cap.total;
          }
        }
      }
    }
    
    if (matchedTotal === 0) {
      const livre = capacidadesDisponiveis.find(c => c.servico === 'Livre');
      if (livre) matchedTotal = livre.total;
      else if (capacidadesDisponiveis.length > 0) matchedTotal = capacidadesDisponiveis[0].total;
    }

    limitePesCalculado = matchedTotal > 0 ? matchedTotal : null;
  }

  const handleTrocaFazenda = (novaFazenda: string) => {
    setFazenda(novaFazenda);
    setQuadra('');
    setRamaisSelecionados([]);
    setQuantidade('');
  };

  const handleTrocaQuadra = (novaQuadra: string) => {
    setQuadra(novaQuadra);
    setRamaisSelecionados([]);
    setQuantidade('');
  };

  const handleTrocaServico = (novoServicoNome: string) => {
    const objServico = servicosFiltrados.find(s => s.nome === novoServicoNome) || listaServicos.find(s => s.nome === novoServicoNome) || null;
    setServico(novoServicoNome);
    setServicoSelecionadoCompleto(objServico);

    const novoIsColeta = objServico?.nome?.toLowerCase().includes('coleta') || novoServicoNome.toLowerCase().includes('coleta');
    const novoPermiteMultiplos = objServico?.permite_multiplos === true || novoIsColeta;

    // Se trocou para um serviço que só aceita 1 ramal, mantém apenas o primeiro ou limpa a quantidade para revalidar
    if (!novoPermiteMultiplos && ramaisSelecionados.length > 1) {
      setRamaisSelecionados([ramaisSelecionados[0]]);
    }
    setQuantidade('');
  };

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
    const valorDigitado = converterParaNumero(texto);
    
    const dadosColab = listaColaboradores.find(c => c.nome === colaborador);
    const fiscalRealDaEquipe = dadosColab?.fiscal_vinculado || perfilLogado?.nome || 'Não Identificado';

    if (!isCarregamentoResina && !isServicoCoringa && limitePesCalculado !== null && valorDigitado > limitePesCalculado) {
      if (!isOffline) {
        supabase.from('alertas_limite').insert([{
          colaborador: colaborador || 'Não Selecionado',
          fazenda: fazenda || 'Não Selecionada',
          quadra: quadra || 'Não Selecionada',
          ramal: ramaisSelecionados.join(', ') || 'Nenhum',
          servico: servico || 'Não Selecionado',
          quantidade_tentada: valorDigitado,
          limite_permitido: limitePesCalculado,
          fiscal_nome: fiscalRealDaEquipe
        }]).then().catch(() => { console.log('Alerta bloqueado pela falta de rede'); }); 
      }
      alertaWebMobile("⚠️ Limite Excedido", "A quantidade informada é maior que o limite deste serviço no(s) ramal(is) selecionado(s).");
      setQuantidade(''); 
    } else {
      setQuantidade(texto);
    }
  };

  const prepararEdicao = (index: number) => {
    const item = lancamentosPendentes[index];
    setIndexEdicao(index);
    setDataOriginalEdicao(item.data);

    setColaborador(item.colaborador);
    setFazenda(limparTextoExibicao(item.fazenda));
    setQuadra(item.quadra && item.quadra !== '-' ? limparTextoExibicao(item.quadra) : '');
    
    let nomePuroServico = String(item.servico || '').replace(/\r?\n/g, ' - ').trim();
    if (nomePuroServico.includes(' - HÍBRIDO')) {
      nomePuroServico = nomePuroServico.replace(' - HÍBRIDO', '').trim();
      setTipoResina('HÍBRIDO');
    } else if (nomePuroServico.includes(' - TROPICAL')) {
      nomePuroServico = nomePuroServico.replace(' - TROPICAL', '').trim();
      setTipoResina('TROPICAL');
    } else if (nomePuroServico.includes(' - ELLIOTTI')) {
      nomePuroServico = nomePuroServico.replace(' - ELLIOTTI', '').trim();
      setTipoResina('ELLIOTTI');
    }

    setServico(nomePuroServico);
    const servicoEncontrado = listaServicos.find(s => s.nome === nomePuroServico) || null;
    setServicoSelecionadoCompleto(servicoEncontrado);
    
    if (item.ramal && item.ramal !== '-') {
      const ramaisArray = String(item.ramal).split(',').map(r => r.trim()).filter(Boolean);
      setRamaisSelecionados(ramaisArray);
    } else {
      setRamaisSelecionados([]);
    }
    
    setQuantidade(String(item.quantidade));
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
    if (!colaborador || !servico || !fazenda || !quantidade) { 
      return alertaWebMobile("Aviso", "Preencha os campos obrigatórios principais!"); 
    }

    const qtdNumerica = converterParaNumero(quantidade);
    if (qtdNumerica <= 0) {
      return alertaWebMobile("Aviso", "Informe uma quantidade válida maior que zero!");
    }

    const dataMomento = new Date();
    const hojeLocalISO = obterDataHojeLocalISO(dataMomento);

    if (!isCarregamentoResina) {
      if (!quadra || ramaisSelecionados.length === 0) {
        return alertaWebMobile("Aviso", "Preencha a Quadra e selecione ao menos 1 Ramal!");
      }
      
      for (let rStr of ramaisSelecionados) {
        const ramalRows = mapaCompleto.filter(m => m.fazenda === fazenda && m.quadra === quadra && String(m.ramal) === rStr);
        if (ramalRows.length === 0) {
          return alertaWebMobile("❌ Erro", `Dados do ramal ${rStr} não encontrados nesta quadra.`);
        }
        for (let row of ramalRows) {
          if (row.data_bloqueio) {
            if (hojeLocalISO !== row.data_bloqueio) { 
              return alertaWebMobile("📅 Data Bloqueada", `Ramal ${row.ramal} tem restrição e só pode ser lançado em: ${new Date(row.data_bloqueio + 'T12:00:00').toLocaleDateString('pt-BR')}`); 
            }
          }
        }
      }

      if (!isServicoCoringa && limitePesCalculado !== null && qtdNumerica > limitePesCalculado) {
        setQuantidade('');
        return alertaWebMobile("⚠️ Limite Excedido", "A quantidade informada ultrapassa o limite permitido para este(s) ramal(is).");
      }
    }
    
    const horaAtualMinutos = dataMomento.getHours() * 60 + dataMomento.getMinutes();
    
    const [horaIniStr, minIniStr] = (horaInicioPermitida || '06:00').split(':');
    const [horaFimStr, minFimStr] = (horaFimPermitida || '23:00').split(':');
    const minutosInicio = (parseInt(horaIniStr, 10) * 60) + (parseInt(minIniStr, 10) || 0);
    const minutosFim = (parseInt(horaFimStr, 10) * 60) + (parseInt(minFimStr, 10) || 0);

    if (horaAtualMinutos < minutosInicio || horaAtualMinutos > minutosFim) {
      return alertaWebMobile("🚫 Fora do Expediente", `Permitido apenas entre ${horaInicioPermitida} e ${horaFimPermitida}.`);
    }

    setSalvando(true);
    let valorUnitario = Number(servicoSelecionadoCompleto?.preco_base) || 0;
    if (servicoSelecionadoCompleto?.tipo_cobranca === 'milheiro') valorUnitario = valorUnitario / 1000;

    try {
      const numRamalFinal = isCarregamentoResina ? '-' : ramaisSelecionados.join(', ');
      const quadraFinal = isCarregamentoResina ? '-' : quadra;
      
      // 🟢 CORREÇÃO DO NOME DA COLETA COM TRAÇO (" - ") EM UMA ÚNICA LINHA
      const nomeServicoFinalParaOBanco = isColeta ? `${servico} - ${tipoResina}` : servico;

      const dadosColaborador = listaColaboradores.find(c => c.nome === colaborador);
      const fiscalOficialDaEquipe = dadosColaborador?.fiscal_vinculado || perfilLogado?.nome || 'Não Identificado';

      // Mantém a data local correta no início da string ISO para nunca virar o dia após as 21h
      const horaLocalStr = dataMomento.toTimeString().split(' ')[0];
      const dataIsoLocalSegura = `${hojeLocalISO}T${horaLocalStr}.000Z`;

      const novoLancamento = {
        colaborador, 
        servico: nomeServicoFinalParaOBanco, 
        fazenda, 
        quadra: quadraFinal, 
        ramal: numRamalFinal, 
        quantidade: qtdNumerica, 
        valor_unitario: valorUnitario, 
        valor_total: arredondarMoeda(qtdNumerica * valorUnitario), 
        data: dataOriginalEdicao ? dataOriginalEdicao : dataIsoLocalSegura,
        fiscal_nome: fiscalOficialDaEquipe 
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
      alertaWebMobile("Erro", "Não foi possível salvar no dispositivo.");
    } finally {
      setSalvando(false);
    }
  };

  // 🟢 SINCRONIZAÇÃO SEGURA LOTE A LOTE (Nunca duplica lotes já enviados se a rede cair no meio)
  const sincronizarComBanco = async () => {
    if (lancamentosPendentes.length === 0) return;
    setSincronizando(true);

    let filaRestante = [...lancamentosPendentes];

    try {
      const tamanhoLote = 50;
      while (filaRestante.length > 0) {
        const loteAtual = filaRestante.slice(0, tamanhoLote);

        const loteProntoParaNuvem = loteAtual.map(item => {
          const { foto_local, foto_url, ...dados } = item;
          if (!dados.quadra || dados.quadra === null) dados.quadra = '-';
          if (!dados.ramal || dados.ramal === null) dados.ramal = '-';
          
          const colabRef = listaColaboradores.find(c => c.nome === dados.colaborador);
          if (colabRef && colabRef.fiscal_vinculado) {
            dados.fiscal_nome = colabRef.fiscal_vinculado;
          }

          return dados;
        });

        const { error: dbError } = await supabase.from('diarios_campo').insert(loteProntoParaNuvem);
        if (dbError) throw new Error(dbError.message);

        // Remove imediatamente os itens que já foram salvos no banco
        filaRestante = filaRestante.slice(tamanhoLote);
        setLancamentosPendentes(filaRestante);
        if (filaRestante.length > 0) {
          await AsyncStorage.setItem('@lancamentos_off', JSON.stringify(filaRestante));
        } else {
          await AsyncStorage.removeItem('@lancamentos_off');
        }
      }
      
      carregarDadosBase(perfilLogado, perfilLogado?.id || null);
      alertaWebMobile("🚀 Sincronizado com Sucesso!", "Todas as produções foram enviadas.");
      
    } catch (e: any) {
      alertaWebMobile(
        "Erro na Sincronização", 
        `A internet falhou. Restam ${filaRestante.length} lançamento(s) seguros no aparelho para tentar novamente.\n\nDetalhe: ${e.message}`
      );
    } finally {
      setSincronizando(false);
    }
  };

  const excluirLancamentoPendente = (index: number) => {
    confirmacaoWebMobile(
      "Excluir Lançamento",
      "Tem certeza que deseja apagar este registro?",
      async () => {
        const novaLista = [...lancamentosPendentes];
        novaLista.splice(index, 1);
        await AsyncStorage.setItem('@lancamentos_off', JSON.stringify(novaLista));
        setLancamentosPendentes(novaLista);
        if (indexEdicao === index) cancelarEdicao();
      }
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
                      <Picker selectedValue={fazenda} onValueChange={handleTrocaFazenda} style={styles.picker}>
                        <Picker.Item label="..." value="" />
                        {fazendasDisponiveis.map((f, i) => (<Picker.Item key={i} label={f} value={f} />))}
                      </Picker>
                    </View>
                  </View>

                  <View style={styles.col}>
                    <Text style={styles.label}>Quadra:</Text>
                    <View style={[styles.pickerContainer, (!fazenda || isCarregamentoResina) && styles.disabled]}>
                      <Picker enabled={!!fazenda && !isCarregamentoResina} selectedValue={isCarregamentoResina ? "" : quadra} onValueChange={handleTrocaQuadra} style={styles.picker}>
                        <Picker.Item label={isCarregamentoResina ? "Não exigida" : "..."} value="" />
                        {!isCarregamentoResina && quadrasDisponiveis.map((q, i) => (<Picker.Item key={i} label={q} value={q} />))}
                      </Picker>
                    </View>
                  </View>
                </View>

                <Text style={styles.label}>Serviço Feito:</Text>
                <View style={styles.pickerContainer}>
                  <Picker 
                    selectedValue={servico} 
                    onValueChange={handleTrocaServico} 
                    style={styles.picker}
                  >
                    <Picker.Item label={fazenda ? "Selecione o Serviço..." : "Selecione a fazenda primeiro..."} value="" />
                    {servicosFiltrados.map((item) => (<Picker.Item key={item.id} label={item.nome} value={item.nome} />))}
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

                {!isCarregamentoResina && (
                  <>
                    <Text style={styles.label}>Qual a Estrutura Feita? (Toque para selecionar):</Text>
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
                        
                        {/* 🟢 BOTÕES APENAS COM NÚMERO */}
                        <View style={styles.chipsContainer}>
                          {ramaisDisponiveis.map((r, i) => {
                            const rStr = String(r.ramal);
                            const selecionado = ramaisSelecionados.includes(rStr);
                            return (
                              <TouchableOpacity 
                                key={i} 
                                style={[styles.chipNumber, selecionado && styles.chipNumberSelecionado]} 
                                onPress={() => toggleRamal(rStr)}
                              >
                                <Text style={[styles.chipNumberText, selecionado && styles.chipNumberTextSelecionado]}>{rStr}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        {/* 🟢 CAIXA AZUL COM OPÇÕES CLICÁVEIS */}
                        {ramaisSelecionados.length > 0 && capacidadesDisponiveis.length > 0 && (
                          <View style={[styles.dicaContainer, isServicoCoringa && {borderColor: '#F39C12', backgroundColor: '#FEF9E7'}]}>
                            {isServicoCoringa ? (
                              <Text style={[styles.dicaTitulo, {color: '#D35400'}]}>🃏 Serviço Coringa Selecionado (Sem Limite de Pés)</Text>
                            ) : (
                              <Text style={styles.dicaTitulo}>💡 Toque na opção para preencher:</Text>
                            )}
                            
                            {capacidadesDisponiveis.map((cap, idx) => (
                              <TouchableOpacity 
                                key={idx} 
                                style={[styles.dicaBotao, isServicoCoringa && {borderColor: '#F39C12'}]} 
                                onPress={() => handleMudancaQuantidade(String(cap.total))}
                              >
                                <View style={styles.dicaRow}>
                                  <Ionicons name="add-circle" size={24} color={isServicoCoringa ? "#E67E22" : "#3498DB"} />
                                  <View style={styles.dicaInfo}>
                                    <Text style={styles.dicaBotaoTotal}>{cap.total} pés</Text>
                                    <Text style={styles.dicaBotaoServico}>{cap.servico}</Text>
                                  </View>
                                </View>
                              </TouchableOpacity>
                            ))}
                          </View>
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
                            {lote.fazenda} {lote.quadra && lote.quadra !== '-' ? `- Q: ${lote.quadra}` : ''}
                          </Text>
                          <Text style={styles.loteItemTexto}>
                            {lote.servico} {lote.ramal && lote.ramal !== '-' ? `(R: ${lote.ramal})` : ''} ➔ {lote.quantidade} un
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
                        <Text style={styles.itemDetalhes}>{item.fazenda} {item.quadra && item.quadra !== '-' ? `| Q: ${item.quadra}` : ''} {item.ramal && item.ramal !== '-' ? `| R: ${item.ramal}` : ''}</Text>
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
  chipNumber: { backgroundColor: '#F8FAFC', minWidth: 45, paddingHorizontal: 12, height: 45, borderRadius: 8, borderWidth: 1, borderColor: '#D5DBDB', justifyContent: 'center', alignItems: 'center' },
  chipNumberSelecionado: { backgroundColor: '#2980B9', borderColor: '#2980B9' },
  chipNumberText: { color: '#34495E', fontWeight: 'bold', fontSize: 16 },
  chipNumberTextSelecionado: { color: '#FFF' },
  
  btnSelecionarTodos: { backgroundColor: '#27AE60', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  btnSelecionarTodosText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  textoDica: { color: '#7F8C8D', fontSize: 13, fontStyle: 'italic', marginTop: 5 },
  
  dicaContainer: { backgroundColor: '#EBF5FB', padding: 12, borderRadius: 8, marginTop: 5, marginBottom: 15, borderWidth: 1, borderColor: '#AED6F1' },
  dicaTitulo: { color: '#2980B9', fontSize: 13, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  dicaBotao: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#3498DB', borderRadius: 8, padding: 12, marginBottom: 8 },
  dicaRow: { flexDirection: 'row', alignItems: 'center' },
  dicaInfo: { marginLeft: 10, flex: 1 },
  dicaBotaoTotal: { fontSize: 16, fontWeight: 'bold', color: '#2C3E50' },
  dicaBotaoServico: { fontSize: 12, color: '#7F8C8D', marginTop: 2 },

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