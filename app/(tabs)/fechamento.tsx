import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
      { text: 'Sim, Excluir', style: 'destructive', onPress: aoConfirmar }
    ]);
  }
};

// 🟢 FUNÇÃO SEGURA PARA NÚMEROS QUEBRADOS (0,5 / 0.5 / ,5 / 1.250,5)
const converterParaNumero = (valor: any): number => {
  if (valor === null || valor === undefined || valor === '') return 0;
  let str = String(valor).trim().replace(/\s+/g, '');
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else {
    str = str.replace(',', '.');
  }
  const numeroParsed = parseFloat(str);
  if (isNaN(numeroParsed)) return 0;
  return Math.round((numeroParsed + Number.EPSILON) * 1000) / 1000;
};

const arredondarMoeda = (valor: number): number => {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
};

const formatarQtd = (valor: any): string => {
  const n = converterParaNumero(valor);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
};

const buscarTodasAsLinhas = async (tabela: string, colunaOrdem: string = 'id', filtroColuna?: string, filtroValor?: string) => {
  let todosOsDados: any[] = [];
  const limite = 1000;
  let inicio = 0;
  let buscando = true;

  while (buscando) {
    let query = supabase
      .from(tabela)
      .select('*')
      .order(colunaOrdem, { ascending: true })
      .range(inicio, inicio + limite - 1);

    if (filtroColuna && filtroValor) {
      query = query.eq(filtroColuna, filtroValor);
    }

    const { data, error } = await query;
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

export default function FechamentoScreen() {
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState('');
  const [listaColaboradores, setListaColaboradores] = useState<any[]>([]);
  
  // DADOS DE BASE PARA EDIÇÃO
  const [listaServicos, setListaServicos] = useState<any[]>([]);
  const [mapaCompleto, setMapaCompleto] = useState<any[]>([]);
  const [fazendasDisponiveis, setFazendasDisponiveis] = useState<string[]>([]);
  const [quadrasDisponiveis, setQuadrasDisponiveis] = useState<string[]>([]);

  // DADOS
  const [dadosCompletosUsuario, setDadosCompletosUsuario] = useState<any[]>([]);
  const [extrato, setExtrato] = useState<any[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);
  const [buscandoExtrato, setBuscandoExtrato] = useState(false);

  // PAGINAÇÃO
  const [paginaAtual, setPaginaAtual] = useState(1);
  const ITENS_POR_PAGINA = 50;

  // FILTROS DE DATA
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  // TOTAIS
  const [totalGanho, setTotalGanho] = useState(0);
  const [totalPes, setTotalPes] = useState(0);

  // ESTADOS DO MODAL DE EDIÇÃO
  const [modalEdicaoVisivel, setModalEdicaoVisivel] = useState(false);
  const [itemEditando, setItemEditando] = useState<any>(null);
  
  const [editData, setEditData] = useState('');
  const [editHora, setEditHora] = useState('');
  const [editServico, setEditServico] = useState('');
  const [editTipoResina, setEditTipoResina] = useState('ELLIOTTI');
  const [editFazenda, setEditFazenda] = useState('');
  const [editQuadra, setEditQuadra] = useState('');
  const [editRamal, setEditRamal] = useState('');
  const [editQuantidade, setEditQuantidade] = useState('');
  const [editDiasAtestado, setEditDiasAtestado] = useState('');
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  useEffect(() => {
    carregarDadosBase();
  }, []);

  useEffect(() => {
    if (colaboradorSelecionado) {
      const hoje = new Date();
      const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

      const strInicio = primeiroDia.toLocaleDateString('pt-BR');
      const strFim = ultimoDia.toLocaleDateString('pt-BR');

      setDataInicio(strInicio);
      setDataFim(strFim);
      setPaginaAtual(1);

      buscarExtratoColaborador(strInicio, strFim);
    } else {
      setDadosCompletosUsuario([]);
      setExtrato([]);
      setTotalGanho(0);
      setTotalPes(0);
    }
  }, [colaboradorSelecionado]);

  useEffect(() => {
    if (editFazenda) {
      const quadras = [...new Set(mapaCompleto.filter(m => m.fazenda === editFazenda).map(m => m.quadra))].filter(Boolean) as string[];
      quadras.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
      setQuadrasDisponiveis(quadras);
    } else {
      setQuadrasDisponiveis([]);
    }
  }, [editFazenda, mapaCompleto]);

  const carregarDadosBase = async () => {
    setCarregandoDados(true);
    try {
      const [colabs, { data: servs }, mapa] = await Promise.all([
        buscarTodasAsLinhas('colaboradores', 'nome'),
        supabase.from('servicos').select('*').order('nome'),
        buscarTodasAsLinhas('mapa_fazendas', 'id')
      ]);

      if (colabs) setListaColaboradores(colabs);
      if (servs) setListaServicos(servs);
      if (mapa) {
        const mapaLimpo = mapa.map((item: any) => ({
          ...item,
          fazenda: item.fazenda ? String(item.fazenda).trim() : '',
          quadra: item.quadra ? String(item.quadra).trim() : ''
        }));
        setMapaCompleto(mapaLimpo);
        const fazendasUnicas = [...new Set(mapaLimpo.map((item: any) => item.fazenda))].filter(Boolean) as string[];
        fazendasUnicas.sort((a, b) => a.localeCompare(b));
        setFazendasDisponiveis(fazendasUnicas);
      }
    } catch (e: any) {
      alertaWebMobile('Erro', 'Falha ao carregar dados base: ' + (e?.message || ''));
    } finally {
      setCarregandoDados(false);
    }
  };

  const buscarExtratoColaborador = async (inicioFallback?: string, fimFallback?: string) => {
    setBuscandoExtrato(true);
    try {
      const data = colaboradorSelecionado !== 'TODOS'
        ? await buscarTodasAsLinhas('diarios_campo', 'id', 'colaborador', colaboradorSelecionado)
        : await buscarTodasAsLinhas('diarios_campo', 'id');

      data.sort((a: any, b: any) => {
        const dA = new Date(a.data || a.created_at || 0).getTime();
        const dB = new Date(b.data || b.created_at || 0).getTime();
        return dB - dA;
      });

      setDadosCompletosUsuario(data);
      const dInicio = inicioFallback !== undefined ? inicioFallback : dataInicio;
      const dFim = fimFallback !== undefined ? fimFallback : dataFim;
      aplicarFiltrosEAtualizarTotais(data, dInicio, dFim);
    } catch (err: any) {
      alertaWebMobile("Erro", "Falha ao buscar os dados: " + (err?.message || ''));
    } finally {
      setBuscandoExtrato(false);
    }
  };

  const formatarDataInput = (texto: string) => {
    let v = texto.replace(/\D/g, '');
    if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2);
    if (v.length > 5) v = v.substring(0, 5) + '/' + v.substring(5, 9);
    return v;
  };

  const formatarHoraInput = (texto: string) => {
    let v = texto.replace(/\D/g, '');
    if (v.length > 2) v = v.replace(/^(\d{2})(\d)/, '$1:$2');
    return v.substring(0, 5);
  };

  const handleEditQuantidadeChange = (texto: string) => {
    // Permite números, vírgula e ponto livremente (ex: 0,5 ou 0.5)
    const limpo = texto.replace(/[^0-9.,]/g, '');
    setEditQuantidade(limpo);
  };

  const aplicarFiltrosEAtualizarTotais = (dadosBase: any[], inicio: string, fim: string) => {
    let filtrados = dadosBase;

    const converterParaISO = (dataBR: string) => {
      const p = dataBR.split('/');
      if (p.length === 3 && p[2].length === 4) return `${p[2]}-${p[1]}-${p[0]}`;
      return null;
    };

    const isoInicio = converterParaISO(inicio);
    const isoFim = converterParaISO(fim);

    if (isoInicio) {
      filtrados = filtrados.filter(item => {
        const dataItem = String(item.data || item.created_at || '').split('T')[0];
        return dataItem >= isoInicio;
      });
    }

    if (isoFim) {
      filtrados = filtrados.filter(item => {
        const dataItem = String(item.data || item.created_at || '').split('T')[0];
        return dataItem <= isoFim;
      });
    }

    setExtrato(filtrados);
    
    let somaDinheiro = 0;
    let somaPes = 0;
    filtrados.forEach(item => {
      somaDinheiro += converterParaNumero(item.valor_total);
      somaPes += converterParaNumero(item.quantidade);
    });
    
    setTotalGanho(arredondarMoeda(somaDinheiro));
    setTotalPes(converterParaNumero(somaPes));
  };

  const acionarFiltroManual = () => {
    setPaginaAtual(1);
    aplicarFiltrosEAtualizarTotais(dadosCompletosUsuario, dataInicio, dataFim);
  };

  const confirmarExclusao = (id: number, servico: string, dataLancamento: string) => {
    confirmacaoWebMobile(
      "⚠️ Excluir Lançamento",
      `Deseja apagar o registro de "${servico}" do dia ${new Date(dataLancamento).toLocaleDateString('pt-BR')}?`,
      () => deletarLancamento(id)
    );
  };

  const deletarLancamento = async (id: number) => {
    const { error } = await supabase.from('diarios_campo').delete().eq('id', id);
    if (error) {
      alertaWebMobile("Erro", "Falha ao excluir: " + error.message);
    } else {
      alertaWebMobile("✅ Excluído", "Lançamento removido.");
      buscarExtratoColaborador(); 
    }
  };

  // FUNÇÕES DE EDIÇÃO 100%
  const abrirEdicao = (item: any) => {
    setItemEditando(item);

    let nomeServicoLimpo = String(item.servico || '').replace(/\r?\n/g, ' - ').trim();
    if (nomeServicoLimpo.toUpperCase().includes(' - HÍBRIDO') || nomeServicoLimpo.toUpperCase().includes(' - HIBRIDO')) {
      nomeServicoLimpo = nomeServicoLimpo.replace(/\s*-\s*H[ÍI]BRIDO/i, '').trim();
      setEditTipoResina('HÍBRIDO');
    } else if (nomeServicoLimpo.toUpperCase().includes(' - TROPICAL')) {
      nomeServicoLimpo = nomeServicoLimpo.replace(/\s*-\s*TROPICAL/i, '').trim();
      setEditTipoResina('TROPICAL');
    } else if (nomeServicoLimpo.toUpperCase().includes(' - ELLIOTTI')) {
      nomeServicoLimpo = nomeServicoLimpo.replace(/\s*-\s*ELLIOTTI/i, '').trim();
      setEditTipoResina('ELLIOTTI');
    } else {
      setEditTipoResina('ELLIOTTI');
    }

    setEditServico(nomeServicoLimpo);
    setEditFazenda(item.fazenda ? String(item.fazenda).trim() : '');
    setEditQuadra(item.quadra ? String(item.quadra).trim() : '');
    setEditRamal(item.ramal !== null && item.ramal !== undefined ? String(item.ramal) : '');
    setEditQuantidade(
      item.quantidade !== null && item.quantidade !== undefined
        ? String(item.quantidade).replace('.', ',')
        : ''
    );
    setEditDiasAtestado(item.dias_atestado ? String(item.dias_atestado) : '');

    try {
      const dataBruta = String(item.data || item.created_at || '');
      const [datePart, timePart] = dataBruta.split('T');
      const [ano, mes, dia] = datePart.split('-');
      setEditData(`${dia}/${mes}/${ano}`);
      setEditHora(timePart ? timePart.substring(0, 5) : '12:00');
    } catch (e) {
      setEditData('');
      setEditHora('');
    }

    setModalEdicaoVisivel(true);
  };

  const isEditColeta = editServico.toLowerCase().includes('coleta');
  const isEditCarregamento = editServico.toUpperCase().includes('CARREGAMENTO DE RESINA');

  const salvarEdicao = async () => {
    if (editData.length !== 10) return alertaWebMobile("Erro", "A data deve estar no formato DD/MM/AAAA");
    if (editHora.length !== 5) return alertaWebMobile("Erro", "A hora deve estar no formato HH:MM");

    setSalvandoEdicao(true);
    
    const [dia, mes, ano] = editData.split('/');
    const novaDataIso = `${ano}-${mes}-${dia}T${editHora}:00.000Z`;

    let updates: any = {};

    if (editServico === 'Falta') {
      updates = {
        servico: 'Falta',
        data: novaDataIso,
        fazenda: null,
        quadra: null,
        ramal: null,
        quantidade: 0,
        valor_total: 0,
        valor_unitario: 0,
        dias_atestado: 0
      };
    } else if (editServico === 'Atestado') {
      updates = {
        servico: 'Atestado',
        data: novaDataIso,
        dias_atestado: parseInt(editDiasAtestado, 10) || 0,
        fazenda: null,
        quadra: null,
        ramal: null,
        quantidade: 0,
        valor_total: 0,
        valor_unitario: 0
      };
    } else {
      const qtdNova = converterParaNumero(editQuantidade);

      if (!editFazenda || !editQuantidade || qtdNova <= 0) {
        setSalvandoEdicao(false);
        return alertaWebMobile("Aviso", "Preencha a Fazenda e informe uma Quantidade válida (ex: 0,5 ou 10).");
      }

      if (!isEditCarregamento && (!editQuadra || !editRamal)) {
        setSalvandoEdicao(false);
        return alertaWebMobile("Aviso", "Preencha Quadra e Ramal.");
      }

      const servicoReferencia = listaServicos.find(
        s => String(s.nome).trim().toUpperCase() === String(editServico).trim().toUpperCase()
      );

      let valUnitario = servicoReferencia
        ? Number(servicoReferencia.preco_base) || 0
        : (Number(itemEditando?.valor_unitario) || 0);

      if (servicoReferencia?.tipo_cobranca === 'milheiro') {
        valUnitario = valUnitario / 1000;
      }

      const servicoFinal = isEditColeta ? `${editServico} - ${editTipoResina}` : editServico;

      updates = {
        servico: servicoFinal,
        data: novaDataIso,
        fazenda: editFazenda,
        quadra: isEditCarregamento ? '-' : editQuadra,
        ramal: isEditCarregamento ? '-' : editRamal.trim(),
        quantidade: qtdNova,
        valor_unitario: valUnitario,
        valor_total: arredondarMoeda(qtdNova * valUnitario),
        dias_atestado: 0
      };
    }

    const { data: atualizado, error } = await supabase
      .from('diarios_campo')
      .update(updates)
      .eq('id', itemEditando.id)
      .select()
      .maybeSingle();
    
    setSalvandoEdicao(false);
    if (error) {
      alertaWebMobile("Erro ao Salvar", `O banco recusou a alteração:\n\n${error.message}`);
    } else {
      if (
        updates.quantidade &&
        atualizado &&
        Math.abs(Number(atualizado.quantidade) - Number(updates.quantidade)) > 0.001
      ) {
        alertaWebMobile(
          "⚠️ Atenção no Banco de Dados",
          `Você enviou ${formatarQtd(updates.quantidade)}, mas a coluna "quantidade" no Supabase arredondou para ${atualizado.quantidade}. Altere o tipo da coluna para numeric(12,2) no Supabase.`
        );
      } else {
        alertaWebMobile("✅ Sucesso", "O lançamento foi completamente atualizado!");
      }
      setModalEdicaoVisivel(false);
      buscarExtratoColaborador();
    }
  };

  const extratoPaginado = extrato.slice(0, paginaAtual * ITENS_POR_PAGINA);

  const servicoAtualEstaNaLista =
    editServico === '' ||
    editServico === 'Falta' ||
    editServico === 'Atestado' ||
    listaServicos.some(s => s.nome === editServico);

  const fazendaAtualEstaNaLista = !editFazenda || fazendasDisponiveis.includes(editFazenda);
  const quadraAtualEstaNaLista = !editQuadra || quadrasDisponiveis.includes(editQuadra);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Folha de Pagamento 💰</Text>
          <Text style={styles.subtitle}>Conferência e Fechamento de Caixa</Text>
        </View>

        <View style={styles.filtroCard}>
          <Text style={styles.label}>Selecione a Visão:</Text>
          <View style={styles.pickerContainer}>
            {carregandoDados ? (
              <ActivityIndicator color="#34495E" style={{ margin: 10 }} />
            ) : (
              <Picker selectedValue={colaboradorSelecionado} onValueChange={setColaboradorSelecionado}>
                <Picker.Item label="Selecione um funcionário ou todos..." value="" />
                <Picker.Item label="🌟 TODOS OS COLABORADORES (TOTAL GERAL)" value="TODOS" />
                {listaColaboradores.map(c => <Picker.Item key={c.id} label={c.nome} value={c.nome} />)}
              </Picker>
            )}
          </View>

          {colaboradorSelecionado !== '' && (
            <View style={styles.blocoDatas}>
              <Text style={styles.labelData}>Filtrar por Período (Opcional):</Text>
              <View style={styles.row}>
                <View style={styles.colData}>
                  <TextInput 
                    style={styles.inputData} 
                    placeholder="De: DD/MM/AAAA" 
                    placeholderTextColor="#95A5A6"
                    keyboardType="numeric"
                    value={dataInicio}
                    onChangeText={(t) => setDataInicio(formatarDataInput(t))}
                    maxLength={10}
                  />
                </View>
                <View style={styles.colData}>
                  <TextInput 
                    style={styles.inputData} 
                    placeholder="Até: DD/MM/AAAA" 
                    placeholderTextColor="#95A5A6"
                    keyboardType="numeric"
                    value={dataFim}
                    onChangeText={(t) => setDataFim(formatarDataInput(t))}
                    maxLength={10}
                  />
                </View>
              </View>
              <TouchableOpacity style={styles.btnFiltrar} onPress={acionarFiltroManual}>
                <Text style={styles.btnFiltrarTexto}>🔍 APLICAR FILTRO E SOMAR</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {colaboradorSelecionado !== '' && (
          <>
            <View style={styles.resumoCard}>
              <Text style={styles.resumoAvisoGlobal}>
                {colaboradorSelecionado === 'TODOS' ? 'VALOR TOTAL DA FAZENDA' : `RESUMO: ${colaboradorSelecionado.toUpperCase()}`}
              </Text>
              <View style={styles.resumoRow}>
                <View style={styles.resumoBox}>
                  <Text style={styles.resumoTitulo}>Total Produzido</Text>
                  <Text style={styles.resumoValorAzul}>{formatarQtd(totalPes)} un</Text>
                </View>
                <View style={styles.resumoBox}>
                  <Text style={styles.resumoTitulo}>Valor de Pagamento</Text>
                  <Text style={styles.resumoValorVerde}>R$ {totalGanho.toFixed(2).replace('.', ',')}</Text>
                </View>
              </View>
              {(dataInicio || dataFim) && (
                <Text style={styles.avisoFiltroAtivo}>
                  Mostrando resultados {dataInicio ? `de ${dataInicio}` : ''} {dataFim ? `até ${dataFim}` : ''}
                </Text>
              )}
            </View>

            <Text style={styles.listaTitulo}>Histórico de Lançamentos ({extrato.length})</Text>

            {buscandoExtrato ? (
              <ActivityIndicator size="large" color="#27AE60" style={{ marginTop: 20 }} />
            ) : extratoPaginado.length === 0 ? (
              <Text style={styles.vazioTexto}>Nenhum registro encontrado neste período.</Text>
            ) : (
              <>
                {extratoPaginado.map((item) => {
                  const isFalta = item.servico === 'Falta';
                  const isAtestado = item.servico === 'Atestado';
                  const dataExibicao = item.data ? new Date(item.data) : new Date(item.created_at);

                  return (
                    <View key={item.id} style={[styles.lancamentoCard, isFalta ? styles.cardFalta : isAtestado ? styles.cardAtestado : null]}>
                      
                      <View style={styles.lancamentoTopo}>
                        <Text style={styles.lancamentoData}>{dataExibicao.toLocaleDateString('pt-BR')} - {dataExibicao.toLocaleTimeString('pt-BR').slice(0, 5)}</Text>
                        <Text style={[styles.lancamentoServico, isFalta ? { color: '#C0392B' } : isAtestado ? { color: '#2980B9' } : null]}>
                          {item.servico}
                        </Text>
                      </View>

                      {colaboradorSelecionado === 'TODOS' && (
                        <Text style={styles.detalheTexto}>👤 Funcionário: {item.colaborador}</Text>
                      )}

                      {!isFalta && !isAtestado && (
                        <View style={styles.lancamentoDetalhes}>
                          <Text style={styles.detalheTexto}>📍 Fazenda: {item.fazenda} | Qd: {item.quadra} | Rm: {item.ramal}</Text>
                          <View style={styles.linhaValores}>
                            <Text style={styles.detalheQtd}>Qtd: {formatarQtd(item.quantidade)} un</Text>
                            <Text style={styles.detalheValor}>+ R$ {Number(item.valor_total || 0).toFixed(2).replace('.', ',')}</Text>
                          </View>
                        </View>
                      )}

                      {isAtestado && (
                        <View style={styles.lancamentoDetalhes}>
                          <Text style={styles.detalheTexto}>🏥 Data: {item.data_atestado || '-'} | Duração: {item.dias_atestado} dias</Text>
                          <Text style={styles.detalheTexto}>🩺 CID: {item.cid_atestado || '-'}</Text>
                        </View>
                      )}

                      <View style={styles.acoesRow}>
                        <TouchableOpacity style={styles.btnEditar} onPress={() => abrirEdicao(item)}>
                          <Text style={styles.btnEditarTexto}>✏️ Editar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.btnExcluir} onPress={() => confirmarExclusao(item.id, item.servico, item.data || item.created_at)}>
                          <Text style={styles.btnExcluirTexto}>🗑️ Excluir</Text>
                        </TouchableOpacity>
                      </View>

                    </View>
                  );
                })}

                {extrato.length > extratoPaginado.length && (
                  <TouchableOpacity style={styles.btnCarregarMais} onPress={() => setPaginaAtual(p => p + 1)}>
                    <Text style={styles.btnCarregarMaisTexto}>🔽 Carregar Mais (+50)</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        )}

        {/* MODAL DE EDIÇÃO 100% */}
        <Modal visible={modalEdicaoVisivel} transparent={true} animationType="slide">
          <View style={styles.modalContainer}>
            <View style={styles.modalCardGrande}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>Editar Lançamento</Text>
                
                <View style={styles.row}>
                  <View style={styles.colData}>
                    <Text style={styles.modalLabel}>Data:</Text>
                    <TextInput style={styles.modalInput} keyboardType="numeric" value={editData} onChangeText={(t) => setEditData(formatarDataInput(t))} maxLength={10} />
                  </View>
                  <View style={styles.colData}>
                    <Text style={styles.modalLabel}>Hora:</Text>
                    <TextInput style={styles.modalInput} keyboardType="numeric" value={editHora} onChangeText={(t) => setEditHora(formatarHoraInput(t))} maxLength={5} />
                  </View>
                </View>

                <Text style={styles.modalLabel}>Serviço:</Text>
                <View style={styles.pickerModalContainer}>
                  <Picker selectedValue={editServico} onValueChange={setEditServico}>
                    {!servicoAtualEstaNaLista && <Picker.Item label={editServico} value={editServico} />}
                    <Picker.Item label="Falta" value="Falta" />
                    <Picker.Item label="Atestado" value="Atestado" />
                    {listaServicos.map(s => <Picker.Item key={s.id} label={s.nome} value={s.nome} />)}
                  </Picker>
                </View>

                {isEditColeta && (
                  <>
                    <Text style={styles.modalLabel}>Tipo de Resina (Coleta):</Text>
                    <View style={styles.pickerModalContainer}>
                      <Picker selectedValue={editTipoResina} onValueChange={setEditTipoResina}>
                        <Picker.Item label="ELLIOTTI" value="ELLIOTTI" />
                        <Picker.Item label="TROPICAL" value="TROPICAL" />
                        <Picker.Item label="HÍBRIDO" value="HÍBRIDO" />
                      </Picker>
                    </View>
                  </>
                )}

                {editServico === 'Atestado' && (
                  <>
                    <Text style={styles.modalLabel}>Dias de Duração:</Text>
                    <TextInput style={styles.modalInput} keyboardType="numeric" value={editDiasAtestado} onChangeText={setEditDiasAtestado} />
                  </>
                )}

                {editServico !== 'Falta' && editServico !== 'Atestado' && (
                  <>
                    <View style={styles.row}>
                      <View style={styles.colData}>
                        <Text style={styles.modalLabel}>Fazenda:</Text>
                        <View style={styles.pickerModalContainer}>
                          <Picker selectedValue={editFazenda} onValueChange={setEditFazenda}>
                            <Picker.Item label="..." value="" />
                            {!fazendaAtualEstaNaLista && <Picker.Item label={editFazenda} value={editFazenda} />}
                            {fazendasDisponiveis.map((f, i) => <Picker.Item key={i} label={f} value={f} />)}
                          </Picker>
                        </View>
                      </View>
                      <View style={styles.colData}>
                        <Text style={styles.modalLabel}>Quadra:</Text>
                        <View style={styles.pickerModalContainer}>
                          <Picker selectedValue={editQuadra} onValueChange={setEditQuadra}>
                            <Picker.Item label="..." value="" />
                            {!quadraAtualEstaNaLista && <Picker.Item label={editQuadra} value={editQuadra} />}
                            {quadrasDisponiveis.map((q, i) => <Picker.Item key={i} label={q} value={q} />)}
                          </Picker>
                        </View>
                      </View>
                    </View>

                    <View style={styles.row}>
                      <View style={styles.colData}>
                        <Text style={styles.modalLabel}>Ramal:</Text>
                        <TextInput style={styles.modalInput} keyboardType="default" value={editRamal} onChangeText={setEditRamal} />
                      </View>
                      <View style={styles.colData}>
                        <Text style={styles.modalLabel}>Quantidade (Ex: 0,5):</Text>
                        <TextInput
                          style={styles.modalInput}
                          keyboardType="decimal-pad"
                          value={editQuantidade}
                          onChangeText={handleEditQuantidadeChange}
                          placeholder="Ex: 0,5"
                        />
                      </View>
                    </View>
                    <Text style={styles.modalAviso}>O total R$ será recalculado com o preço atual do serviço.</Text>
                  </>
                )}

                <View style={styles.modalAcoes}>
                  <TouchableOpacity style={styles.modalBtnCancelar} onPress={() => setModalEdicaoVisivel(false)}>
                    <Text style={styles.modalBtnTextoCancelar}>Cancelar</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.modalBtnSalvar} onPress={salvarEdicao} disabled={salvandoEdicao}>
                    {salvandoEdicao ? <ActivityIndicator color="#FFF" /> : <Text style={styles.modalBtnTextoSalvar}>Salvar Alterações</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <View style={{ height: 80 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4F7', padding: 20 },
  header: { marginTop: 30, marginBottom: 20, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 14, color: '#7F8C8D' },
  
  filtroCard: { backgroundColor: '#34495E', padding: 15, borderRadius: 12, marginBottom: 20 },
  label: { color: '#BDC3C7', fontSize: 12, fontWeight: 'bold', marginBottom: 5 },
  pickerContainer: { backgroundColor: '#FFF', borderRadius: 8, overflow: 'hidden' },

  blocoDatas: { marginTop: 15, borderTopWidth: 1, borderTopColor: '#465C70', paddingTop: 15 },
  labelData: { color: '#BDC3C7', fontSize: 12, fontWeight: 'bold', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  colData: { width: '48%' },
  inputData: { backgroundColor: '#FFF', borderRadius: 6, padding: 10, fontSize: 14, color: '#2C3E50', textAlign: 'center', fontWeight: 'bold' },
  btnFiltrar: { backgroundColor: '#27AE60', padding: 12, borderRadius: 6, marginTop: 15, alignItems: 'center' },
  btnFiltrarTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },

  resumoCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 12, elevation: 5, marginBottom: 25 },
  resumoAvisoGlobal: { textAlign: 'center', fontWeight: 'bold', color: '#34495E', marginBottom: 15, fontSize: 14, borderBottomWidth: 1, borderBottomColor: '#ECF0F1', paddingBottom: 5 },
  resumoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  resumoBox: { alignItems: 'center', width: '48%' },
  resumoTitulo: { fontSize: 12, color: '#7F8C8D', fontWeight: 'bold', textTransform: 'uppercase' },
  resumoValorAzul: { fontSize: 24, fontWeight: '900', color: '#2980B9', marginTop: 5 },
  resumoValorVerde: { fontSize: 24, fontWeight: '900', color: '#27AE60', marginTop: 5 },
  avisoFiltroAtivo: { textAlign: 'center', color: '#E67E22', fontWeight: 'bold', fontSize: 11, marginTop: 10 },

  listaTitulo: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50', marginBottom: 15, borderBottomWidth: 1, borderColor: '#D5DBDB', paddingBottom: 5 },
  vazioTexto: { textAlign: 'center', color: '#95A5A6', fontStyle: 'italic', marginTop: 20 },

  lancamentoCard: { backgroundColor: '#FFF', padding: 15, borderRadius: 10, marginBottom: 12, borderLeftWidth: 5, borderLeftColor: '#27AE60', elevation: 2 },
  cardFalta: { borderLeftColor: '#E74C3C', backgroundColor: '#FDEDEC' },
  cardAtestado: { borderLeftColor: '#3498DB', backgroundColor: '#EBF5FB' },
  
  lancamentoTopo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F2F4F4', paddingBottom: 5 },
  lancamentoData: { fontSize: 12, color: '#95A5A6', fontWeight: 'bold' },
  lancamentoServico: { fontSize: 14, fontWeight: 'bold', color: '#2C3E50' },
  
  lancamentoDetalhes: { marginBottom: 10 },
  detalheTexto: { fontSize: 13, color: '#34495E', marginBottom: 3, fontWeight: 'bold' },
  linhaValores: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  detalheQtd: { fontSize: 14, fontWeight: 'bold', color: '#7F8C8D' },
  detalheValor: { fontSize: 16, fontWeight: '900', color: '#27AE60' },

  acoesRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, borderTopWidth: 1, borderTopColor: '#ECF0F1', paddingTop: 10 },
  btnEditar: { backgroundColor: '#EAF2F8', padding: 8, borderRadius: 5, alignItems: 'center', width: '48%' },
  btnEditarTexto: { color: '#2980B9', fontSize: 12, fontWeight: 'bold' },
  btnExcluir: { backgroundColor: '#FADBD8', padding: 8, borderRadius: 5, alignItems: 'center', width: '48%' },
  btnExcluirTexto: { color: '#C0392B', fontSize: 12, fontWeight: 'bold' },

  btnCarregarMais: { backgroundColor: '#D5DBDB', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  btnCarregarMaisTexto: { color: '#2C3E50', fontWeight: 'bold', fontSize: 14 },

  // ESTILOS DO MODAL
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalCardGrande: { backgroundColor: '#FFF', padding: 20, borderRadius: 15, elevation: 10, maxHeight: '90%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E50', marginBottom: 15, textAlign: 'center' },
  modalLabel: { fontSize: 13, fontWeight: 'bold', color: '#34495E', marginBottom: 5, marginTop: 10 },
  modalInput: { borderWidth: 1, borderColor: '#D5DBDB', borderRadius: 8, padding: 10, fontSize: 16, backgroundColor: '#F8FAFC', textAlign: 'center', height: 45 },
  pickerModalContainer: { borderWidth: 1, borderColor: '#D5DBDB', borderRadius: 8, backgroundColor: '#F8FAFC', overflow: 'hidden', height: 45, justifyContent: 'center' },
  modalAviso: { fontSize: 11, color: '#E67E22', fontStyle: 'italic', marginTop: 15, marginBottom: 15, textAlign: 'center' },
  modalAcoes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  modalBtnCancelar: { backgroundColor: '#95A5A6', padding: 15, borderRadius: 8, width: '48%', alignItems: 'center' },
  modalBtnTextoCancelar: { color: '#FFF', fontWeight: 'bold' },
  modalBtnSalvar: { backgroundColor: '#27AE60', padding: 15, borderRadius: 8, width: '48%', alignItems: 'center' },
  modalBtnTextoSalvar: { color: '#FFF', fontWeight: 'bold' }
});