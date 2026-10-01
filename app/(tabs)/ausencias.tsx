import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import * as Print from 'expo-print';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

const ITENS_POR_PAGINA = 50;

export default function AusenciasScreen() {
  const [colaborador, setColaborador] = useState('');
  const [tipoAusencia, setTipoAusencia] = useState('Atestado'); 

  // ESTADOS PARA OCORRÊNCIAS (Atestado e Novas Licenças)
  const [dataOcorrencia, setDataOcorrencia] = useState('');
  const [diasOcorrencia, setDiasOcorrencia] = useState('');
  const [cidAtestado, setCidAtestado] = useState('');

  // ESTADOS PARA O ABONO
  const [dataAbono, setDataAbono] = useState('');
  const [motivoAbono, setMotivoAbono] = useState('');

  // ESTADO: VALOR DA DIÁRIA (Serve para todos)
  const [valorDiaria, setValorDiaria] = useState('');

  // ESTADOS DO SISTEMA OFFLINE
  const [listaColaboradores, setListaColaboradores] = useState<any[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [carregandoDados, setCarregandoDados] = useState(true);

  const [perfilLogado, setPerfilLogado] = useState<any>(null);
  const [ausenciasPendentes, setAusenciasPendentes] = useState<any[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // ESTADOS DE EDIÇÃO OFFLINE
  const [modalPendentesVisivel, setModalPendentesVisivel] = useState(false);
  const [indexEdicao, setIndexEdicao] = useState<number | null>(null);

  // ESTADOS PARA EDIÇÃO ONLINE (BANCO DE DADOS)
  const [ausenciasOnline, setAusenciasOnline] = useState<any[]>([]);
  const [modalOnlineVisivel, setModalOnlineVisivel] = useState(false);
  const [carregandoOnline, setCarregandoOnline] = useState(false);
  const [idEdicaoOnline, setIdEdicaoOnline] = useState<number | null>(null);

  // ESTADOS DE BUSCA, DUPLICIDADES, PAGINAÇÃO E PDF NOS MODAIS
  const [buscaModal, setBuscaModal] = useState('');
  const [apenasDuplicados, setApenasDuplicados] = useState(false);
  const [paginaModal, setPaginaModal] = useState(1);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  useFocusEffect(
    useCallback(() => {
      carregarUsuarioLogado();
      carregarAusenciasLocais();
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
          carregarDadosBase(perfilData);
          setIsOffline(false);
        } else {
          acionarMochila(perfilSalvoStr);
        }
      } else {
        acionarMochila(perfilSalvoStr);
      }
    } catch (e) {
      const perfilSalvoStr = await AsyncStorage.getItem('@perfil_offline');
      acionarMochila(perfilSalvoStr);
    }
  };

  const acionarMochila = (perfilSalvoStr: string | null) => {
    setIsOffline(true);
    if (perfilSalvoStr) {
      const p = JSON.parse(perfilSalvoStr);
      setPerfilLogado(p);
      carregarDadosBase(p);
    }
  };

  const carregarDadosBase = async (perfilLido: any) => {
    setCarregandoDados(true);
    try {
      let { data: colabs, error } = await supabase.from('colaboradores').select('*').order('nome');
      if (error) throw new Error("Sem rede");

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
      setIsOffline(false);
    } catch (e) {
      setIsOffline(true);
      const mochilaColabs = await AsyncStorage.getItem('@mochila_colaboradores');
      if (mochilaColabs) {
        let colabsOff = JSON.parse(mochilaColabs);
        if (perfilLido && perfilLido.cargo !== 'Administrador') {
          colabsOff = colabsOff.filter((c: any) => 
            c.fiscal_vinculado === perfilLido.nome || 
            c.fiscal_id === perfilLido.id
          );
        }
        setListaColaboradores(colabsOff);
      }
    }
    setCarregandoDados(false);
  };

  const carregarAusenciasLocais = async () => {
    try {
      const dados = await AsyncStorage.getItem('@ausencias_off');
      if (dados) setAusenciasPendentes(JSON.parse(dados));
    } catch (e) {
      console.log("Erro ao carregar atestados offline");
    }
  };

  const aplicarMascaraData = (texto: string) => {
    let v = texto.replace(/\D/g, ''); 
    if (v.length > 8) v = v.substring(0, 8); 
    if (v.length > 4) v = v.replace(/^(\d{2})(\d{2})(\d{1,4}).*/, '$1/$2/$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{1,2}).*/, '$1/$2');
    return v;
  };

  const converterParaBanco = (dataBR: string) => {
    const partes = dataBR.split('/');
    if (partes.length === 3) return `${partes[2]}-${partes[1]}-${partes[0]}`;
    return null;
  };

  const converterParaUI = (dataBD: string | null) => {
    if (!dataBD) return '';
    const partes = dataBD.split('-');
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return dataBD;
  };

  const parseEdicao = (item: any) => {
    setColaborador(item.colaborador);
    setValorDiaria(item.valor_unitario ? String(item.valor_unitario).replace('.', ',') : '');

    if (item.servico && item.servico.startsWith('Abono')) {
      setTipoAusencia('Abono');
      setDataAbono(converterParaUI(item.data));
      const match = item.servico.match(/\((.*?)\)/);
      if (match) setMotivoAbono(match[1]);
      else setMotivoAbono('');
    } else {
      setTipoAusencia(item.servico || 'Atestado'); 
      setDataOcorrencia(converterParaUI(item.data_atestado || item.data));
      setDiasOcorrencia(item.dias_atestado ? String(item.dias_atestado) : '');
      setCidAtestado(item.cid_atestado || '');
    }
  };

  const prepararEdicao = (indexOriginal: number) => {
    parseEdicao(ausenciasPendentes[indexOriginal]);
    setIndexEdicao(indexOriginal);
    setIdEdicaoOnline(null);
    setModalPendentesVisivel(false);
  };

  const prepararEdicaoOnline = (item: any) => {
    parseEdicao(item);
    setIdEdicaoOnline(item.id);
    setIndexEdicao(null);
    setModalOnlineVisivel(false);
  };

  const abrirModalPendentes = () => {
    setBuscaModal('');
    setApenasDuplicados(false);
    setPaginaModal(1);
    setModalPendentesVisivel(true);
  };

  const abrirHistoricoOnline = async () => {
    if (isOffline) return Alert.alert("Sem Conexão", "Você precisa de internet para buscar o histórico do banco de dados.");

    setBuscaModal('');
    setApenasDuplicados(false);
    setPaginaModal(1);
    setModalOnlineVisivel(true);
    setCarregandoOnline(true);

    try {
      let query = supabase
        .from('diarios_campo')
        .select('*')
        .eq('quantidade', 0)
        .eq('fazenda', '-')
        .order('id', { ascending: false })
        .limit(1000);

      if (perfilLogado && perfilLogado.cargo !== 'Administrador') {
        query = query.eq('fiscal_nome', perfilLogado.nome);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (data) setAusenciasOnline(data);
    } catch (e) {
      Alert.alert("Erro", "Não foi possível buscar o histórico.");
    } finally {
      setCarregandoOnline(false);
    }
  };

  const excluirRegistroOnline = (id: number) => {
    if (Platform.OS === 'web') {
      const confirmar = (globalThis as any).confirm?.("Tem certeza que deseja apagar este registro do banco de dados?");
      if (!confirmar) return;
      executarExclusaoOnline(id);
    } else {
      Alert.alert(
        "Excluir Definitivamente",
        "Tem certeza que deseja apagar este registro do banco de dados?",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Apagar", style: "destructive", onPress: () => executarExclusaoOnline(id) }
        ]
      );
    }
  };

  const executarExclusaoOnline = async (id: number) => {
    setCarregandoOnline(true);
    const { error } = await supabase.from('diarios_campo').delete().eq('id', id);
    setCarregandoOnline(false);

    if (error) {
      Alert.alert("Erro", "Não foi possível excluir.");
    } else {
      setAusenciasOnline(prev => prev.filter(a => a.id !== id));
    }
  };

  const cancelarEdicao = () => {
    setIndexEdicao(null);
    setIdEdicaoOnline(null);
    setColaborador('');
    setDataOcorrencia('');
    setDiasOcorrencia('');
    setCidAtestado('');
    setDataAbono('');
    setMotivoAbono('');
    setValorDiaria('');
  };

  // =========================================================================
  // LÓGICA DE LANÇAMENTO (INTACTA)
  // =========================================================================
  const salvarAusencia = async () => {
    if (!colaborador || !tipoAusencia) {
      return Alert.alert("Aviso", "Selecione o colaborador e o tipo de ocorrência!");
    }

    let dataLancamentoBD = null;
    let diasBD = null;
    let cidBD = null;
    let servicoFinal = tipoAusencia;

    if (tipoAusencia === 'Abono') {
      if (!dataAbono || dataAbono.length !== 10) {
        return Alert.alert("Aviso", "Preencha a data do abono corretamente (DD/MM/AAAA)!");
      }
      dataLancamentoBD = converterParaBanco(dataAbono);
      servicoFinal = motivoAbono.trim() ? `Abono (${motivoAbono.trim()})` : 'Abono';
    } 
    else {
      if (!dataOcorrencia || dataOcorrencia.length !== 10 || !diasOcorrencia) {
        return Alert.alert("Aviso", "Preencha a data e a quantidade de dias da ocorrência!");
      }
      if (tipoAusencia === 'Atestado' && !cidAtestado) {
        return Alert.alert("Aviso", "Preencha o código CID do atestado médico!");
      }
      
      dataLancamentoBD = converterParaBanco(dataOcorrencia);
      diasBD = parseInt(diasOcorrencia) || 1;
      cidBD = tipoAusencia === 'Atestado' ? cidAtestado : null;
    }

    let valNum = 0;
    if (valorDiaria) {
      valNum = parseFloat(valorDiaria.replace(',', '.'));
      if (isNaN(valNum)) valNum = 0;
    }
    
    const multiplicadorDias = tipoAusencia === 'Abono' ? 1 : diasBD;
    const valTotal = valNum * (multiplicadorDias || 1);

    setSalvando(true);

    const payload: any = { 
      colaborador: colaborador, 
      servico: servicoFinal,
      fazenda: '-', 
      quadra: '-', 
      ramal: '-', 
      quantidade: 0,
      valor_unitario: valNum,
      valor_total: valTotal,
      data_atestado: tipoAusencia !== 'Abono' ? dataLancamentoBD : null,
      dias_atestado: tipoAusencia !== 'Abono' ? diasBD : null,
      cid_atestado: cidBD,
      fiscal_nome: perfilLogado?.nome || 'Fiscal Não Identificado',
      observacao: 'SISTEMA_NOVO'
    };

    if (dataLancamentoBD) {
      payload.data = dataLancamentoBD;
    }

    try {
      if (idEdicaoOnline !== null) {
        const { error } = await supabase.from('diarios_campo').update(payload).eq('id', idEdicaoOnline);
        if (error) throw error;
        Alert.alert("✅ Sucesso", "Registro atualizado diretamente no banco de dados!");
        cancelarEdicao();
        setSalvando(false);
        return;
      }

      let novaLista = [...ausenciasPendentes];
      if (indexEdicao !== null) {
        novaLista[indexEdicao] = payload;
      } else {
        novaLista.push(payload);
      }

      await AsyncStorage.setItem('@ausencias_off', JSON.stringify(novaLista));
      setAusenciasPendentes(novaLista);

      Alert.alert("✅ Sucesso!", indexEdicao !== null ? "Registro editado com sucesso." : `O registro de ${colaborador} está aguardando envio.`);
      cancelarEdicao();

    } catch (e) {
      Alert.alert("Erro", "Falha ao processar o registro.");
    } finally {
      setSalvando(false);
    }
  };

  const sincronizarComBanco = async () => {
    if (ausenciasPendentes.length === 0) return;
    setSincronizando(true);

    try {
      const { error } = await supabase.from('diarios_campo').insert(ausenciasPendentes);
      if (error) throw error;

      await AsyncStorage.removeItem('@ausencias_off');
      setAusenciasPendentes([]);
      Alert.alert("🚀 Sincronizado com Sucesso!", "Todos os registros foram enviados.");
    } catch (e: any) {
      Alert.alert("Erro na Sincronização", "Envio interrompido: " + e.message);
    } finally {
      setSincronizando(false);
    }
  };

  const excluirPendente = async (indexOriginal: number) => {
    if (Platform.OS === 'web') {
      const confirmar = (globalThis as any).confirm?.("Tem certeza que deseja apagar este registro pendente?");
      if (!confirmar) return;
      const novaLista = [...ausenciasPendentes];
      novaLista.splice(indexOriginal, 1);
      await AsyncStorage.setItem('@ausencias_off', JSON.stringify(novaLista));
      setAusenciasPendentes(novaLista);
      if (indexEdicao === indexOriginal) cancelarEdicao();
    } else {
      Alert.alert(
        "Excluir Registro",
        "Tem certeza que deseja apagar este registro do celular?",
        [
          { text: "Cancelar", style: "cancel" },
          { 
            text: "Apagar", 
            style: "destructive",
            onPress: async () => {
              const novaLista = [...ausenciasPendentes];
              novaLista.splice(indexOriginal, 1);
              await AsyncStorage.setItem('@ausencias_off', JSON.stringify(novaLista));
              setAusenciasPendentes(novaLista);

              if (indexEdicao === indexOriginal) cancelarEdicao();
            }
          }
        ]
      );
    }
  };

  // =========================================================================
  // DETECÇÃO DE DUPLICIDADES E EXPORTAÇÃO PDF (COMPATÍVEL COM WEB E ANDROID)
  // =========================================================================
  const gerarChaveDuplicidade = (item: any) => {
    const nome = (item.colaborador || '').trim().toUpperCase();
    const dt = item.data || item.data_atestado || 'SEM_DATA';
    return `${nome}__${dt}`;
  };

  const processarListaModal = (listaOriginal: any[]) => {
    const contagem: Record<string, number> = {};
    const indiceAtualPorChave: Record<string, number> = {};

    listaOriginal.forEach((item) => {
      const chave = gerarChaveDuplicidade(item);
      contagem[chave] = (contagem[chave] || 0) + 1;
    });

    let enriquecida = listaOriginal.map((item, idx) => {
      const chave = gerarChaveDuplicidade(item);
      indiceAtualPorChave[chave] = (indiceAtualPorChave[chave] || 0) + 1;

      return {
        ...item,
        _indexOriginal: idx,
        _chaveDup: chave,
        _isDuplicado: contagem[chave] > 1,
        _qtdDuplicados: contagem[chave],
        _ordemDuplicado: indiceAtualPorChave[chave]
      };
    });

    const totalDuplicados = enriquecida.filter(i => i._isDuplicado).length;

    if (apenasDuplicados) {
      enriquecida = enriquecida.filter(i => i._isDuplicado);
      enriquecida.sort((a, b) => a._chaveDup.localeCompare(b._chaveDup));
    }

    // Busca por texto (Nome, Data, CID, Tipo ou Quem Lançou)
    if (buscaModal.trim() !== '') {
      const termo = buscaModal.trim().toLowerCase();
      enriquecida = enriquecida.filter(i => {
        const dtBR = converterParaUI(i.data || i.data_atestado);
        return (
          (i.colaborador || '').toLowerCase().includes(termo) ||
          (i.servico || '').toLowerCase().includes(termo) ||
          (i.cid_atestado || '').toLowerCase().includes(termo) ||
          (i.fiscal_nome || '').toLowerCase().includes(termo) ||
          dtBR.includes(termo)
        );
      });
    }

    const somaFinanceira = enriquecida.reduce((acc, cur) => acc + (Number(cur.valor_total) || 0), 0);

    return {
      itens: enriquecida,
      totalDuplicados,
      somaFinanceira
    };
  };

  const dadosModalOffline = useMemo(
    () => processarListaModal(ausenciasPendentes),
    [ausenciasPendentes, buscaModal, apenasDuplicados]
  );

  const dadosModalOnline = useMemo(
    () => processarListaModal(ausenciasOnline),
    [ausenciasOnline, buscaModal, apenasDuplicados]
  );

  const exportarPDF = async (
    dadosProcessados: { itens: any[]; totalDuplicados: number; somaFinanceira: number },
    tituloModal: string
  ) => {
    if (dadosProcessados.itens.length === 0) {
      return Alert.alert("Aviso", "Não há registros na lista atual para exportar.");
    }

    setGerandoPdf(true);
    try {
      const dataGeracao = new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const nomeFiscal = perfilLogado?.nome || 'Não Identificado';

      const linhasTabela = dadosProcessados.itens.map((item, idx) => {
        const dtFormatada = converterParaUI(item.data || item.data_atestado) || '-';
        const dias = item.dias_atestado ? `${item.dias_atestado} dia(s)` : '1 dia';
        const cid = item.cid_atestado || '-';
        const lancadoPor = item.fiscal_nome || 'Não informado';
        const valor = `R$ ${(Number(item.valor_total) || 0).toFixed(2).replace('.', ',')}`;
        const badgeDup = item._isDuplicado
          ? `<span style="color: #C0392B; font-weight: bold;">DUPLICADO (${item._ordemDuplicado}/${item._qtdDuplicados})</span>`
          : `<span style="color: #27AE60;">Normal</span>`;
        const bgRow = item._isDuplicado
          ? 'background-color: #FDEDEC;'
          : idx % 2 === 0
          ? 'background-color: #FFFFFF;'
          : 'background-color: #F8FAFC;';

        return `
          <tr style="${bgRow}">
            <td style="padding: 8px; border: 1px solid #BDC3C7; font-weight: bold;">${item.colaborador || '-'}</td>
            <td style="padding: 8px; border: 1px solid #BDC3C7;">${item.servico || '-'}</td>
            <td style="padding: 8px; border: 1px solid #BDC3C7; text-align: center;">${dtFormatada}</td>
            <td style="padding: 8px; border: 1px solid #BDC3C7; text-align: center;">${dias}</td>
            <td style="padding: 8px; border: 1px solid #BDC3C7; text-align: center;">${cid}</td>
            <td style="padding: 8px; border: 1px solid #BDC3C7;">${lancadoPor}</td>
            <td style="padding: 8px; border: 1px solid #BDC3C7; text-align: right; font-weight: bold;">${valor}</td>
            <td style="padding: 8px; border: 1px solid #BDC3C7; text-align: center; font-size: 11px;">${badgeDup}</td>
          </tr>
        `;
      }).join('');

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Relatorio_Ausencias</title>
            <style>
              @page { size: A4; margin: 12mm; }
              body { font-family: Arial, Helvetica, sans-serif; color: #2C3E50; margin: 0; padding: 0; }
              .header { border-bottom: 2px solid #2C3E50; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
              .title { font-size: 20px; font-weight: bold; margin: 0; color: #2C3E50; }
              .subtitle { font-size: 12px; color: #7F8C8D; margin-top: 4px; }
              .resumo-box { display: flex; gap: 12px; margin-bottom: 20px; }
              .card-resumo { flex: 1; padding: 10px; border-radius: 6px; background: #F0F4F8; border: 1px solid #D5DBDB; text-align: center; }
              .card-resumo-valor { font-size: 16px; font-weight: bold; margin-top: 4px; }
              table { width: 100%; border-collapse: collapse; font-size: 11px; }
              th { background-color: #2C3E50; color: #FFFFFF; padding: 8px; border: 1px solid #2C3E50; text-align: left; }
            </style>
          </head>
          <body>
            <div class="header">
              <div>
                <h1 class="title">Relatório de Ausências e Ocorrências</h1>
                <div class="subtitle">Origem: ${tituloModal} | Emitido por: ${nomeFiscal}</div>
              </div>
              <div style="text-align: right; font-size: 11px; color: #7F8C8D;">
                Data de Emissão:<br/><strong>${dataGeracao}</strong>
              </div>
            </div>

            <div class="resumo-box">
              <div class="card-resumo">
                <div style="font-size: 10px; color: #7F8C8D;">REGISTROS IMPRESSOS</div>
                <div class="card-resumo-valor">${dadosProcessados.itens.length}</div>
              </div>
              <div class="card-resumo">
                <div style="font-size: 10px; color: #7F8C8D;">DUPLICIDADES NA LISTA</div>
                <div class="card-resumo-valor" style="color: ${dadosProcessados.totalDuplicados > 0 ? '#C0392B' : '#27AE60'};">${dadosProcessados.totalDuplicados}</div>
              </div>
              <div class="card-resumo">
                <div style="font-size: 10px; color: #7F8C8D;">VALOR TOTAL</div>
                <div class="card-resumo-valor" style="color: #27AE60;">R$ ${dadosProcessados.somaFinanceira.toFixed(2).replace('.', ',')}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Ocorrência</th>
                  <th style="text-align: center;">Data</th>
                  <th style="text-align: center;">Duração</th>
                  <th style="text-align: center;">CID</th>
                  <th>Lançado por</th>
                  <th style="text-align: right;">Valor Total</th>
                  <th style="text-align: center;">Auditoria</th>
                </tr>
              </thead>
              <tbody>
                ${linhasTabela}
              </tbody>
            </table>
          </body>
        </html>
      `;

      if (Platform.OS === 'web') {
        const docWeb = (globalThis as any).document;
        if (docWeb) {
          const iframe = docWeb.createElement('iframe');
          iframe.style.position = 'fixed';
          iframe.style.right = '0';
          iframe.style.bottom = '0';
          iframe.style.width = '0';
          iframe.style.height = '0';
          iframe.style.border = '0';
          docWeb.body.appendChild(iframe);

          const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
          if (iframeDoc) {
            iframeDoc.open();
            iframeDoc.write(html);
            iframeDoc.close();

            setTimeout(() => {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
              setTimeout(() => {
                if (docWeb.body.contains(iframe)) {
                  docWeb.body.removeChild(iframe);
                }
              }, 2000);
            }, 350);
          }
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        const podeCompartilhar = await Sharing.isAvailableAsync();
        if (podeCompartilhar) {
          await Sharing.shareAsync(uri, {
            UTI: '.pdf',
            mimeType: 'application/pdf',
            dialogTitle: 'Exportar Relatório PDF'
          });
        } else {
          await Print.printAsync({ html });
        }
      }
    } catch (e) {
      Alert.alert("Erro", "Não foi possível gerar o PDF.");
    } finally {
      setGerandoPdf(false);
    }
  };

  // RENDERIZAÇÃO DO CONTEÚDO DO MODAL (OFFLINE E ONLINE)
  const renderConteudoModalOrganizado = (
    dados: { itens: any[]; totalDuplicados: number; somaFinanceira: number },
    tituloModal: string,
    isOnlineModal: boolean
  ) => {
    const totalPaginas = Math.max(1, Math.ceil(dados.itens.length / ITENS_POR_PAGINA));
    const paginaSegura = Math.min(paginaModal, totalPaginas);
    const inicioSlice = (paginaSegura - 1) * ITENS_POR_PAGINA;
    const fimSlice = inicioSlice + ITENS_POR_PAGINA;
    const itensPaginados = dados.itens.slice(inicioSlice, fimSlice);

    return (
      <>
        {/* TOPO: TÍTULO + BOTÃO DE EXPORTAR PDF */}
        <View style={styles.modalHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>{tituloModal}</Text>
            <Text style={styles.modalSubtitle}>
              {apenasDuplicados ? 'Exibindo apenas registros duplicados' : `Total listado: ${dados.itens.length} registro(s)`}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.btnPdf}
            onPress={() => exportarPDF(dados, tituloModal)}
            disabled={gerandoPdf}
          >
            {gerandoPdf ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="print-outline" size={18} color="#FFF" />
                <Text style={styles.btnPdfTexto}>GERAR PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* PAINEL DE DUPLICIDADES CLARO E COM UM ÚNICO BOTÃO DE AÇÃO */}
        {dados.totalDuplicados > 0 ? (
          <View style={[styles.painelDuplicidade, apenasDuplicados && styles.painelDuplicidadeAtivo]}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={[styles.painelDuplicidadeTitulo, apenasDuplicados && { color: '#FFF' }]}>
                {apenasDuplicados
                  ? `🔍 Modo de Auditoria Ativo (${dados.totalDuplicados} duplicados)`
                  : `⚠️ Atenção: ${dados.totalDuplicados} lançamentos duplicados!`}
              </Text>
              <Text style={[styles.painelDuplicidadeSub, apenasDuplicados && { color: '#FDEDEC' }]}>
                {apenasDuplicados
                  ? 'Os registros iguais estão colados abaixo. Exclua ou edite o repetido.'
                  : 'Mesmo colaborador com mais de um lançamento na mesma data.'}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.btnAlternarDuplicados, apenasDuplicados && styles.btnAlternarDuplicadosAtivo]}
              onPress={() => {
                setApenasDuplicados(!apenasDuplicados);
                setPaginaModal(1);
              }}
            >
              <Text style={[styles.btnAlternarDuplicadosTexto, apenasDuplicados && { color: '#C0392B' }]}>
                {apenasDuplicados ? '↩️ MOSTRAR TODOS' : '🔍 VER DUPLICADOS'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.painelSemDuplicidade}>
            <Ionicons name="checkmark-circle" size={18} color="#27AE60" />
            <Text style={styles.painelSemDuplicidadeTexto}>
              Nenhuma duplicidade encontrada nesta lista. Tudo certo!
            </Text>
          </View>
        )}

        {/* BARRA DE PESQUISA + VALOR TOTAL */}
        <View style={styles.barraBuscaEResumo}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#7F8C8D" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar colaborador, fiscal, data ou CID..."
              placeholderTextColor="#95A5A6"
              value={buscaModal}
              onChangeText={(txt) => {
                setBuscaModal(txt);
                setPaginaModal(1);
              }}
            />
            {buscaModal.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setBuscaModal('');
                  setPaginaModal(1);
                }}
              >
                <Ionicons name="close-circle" size={18} color="#95A5A6" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.caixaSomaTotal}>
            <Text style={styles.caixaSomaLabel}>Soma da Lista</Text>
            <Text style={styles.caixaSomaValor}>
              R$ {dados.somaFinanceira.toFixed(2).replace('.', ',')}
            </Text>
          </View>
        </View>

        {/* CONTROLES DE PAGINAÇÃO (50 EM 50) */}
        {dados.itens.length > ITENS_POR_PAGINA && (
          <View style={styles.paginacaoContainer}>
            <TouchableOpacity
              style={[styles.btnPaginacao, paginaSegura <= 1 && styles.btnPaginacaoDesativado]}
              disabled={paginaSegura <= 1}
              onPress={() => setPaginaModal(prev => Math.max(1, prev - 1))}
            >
              <Ionicons name="chevron-back" size={16} color="#FFF" />
              <Text style={styles.btnPaginacaoTexto}>Anterior</Text>
            </TouchableOpacity>

            <Text style={styles.paginacaoInfo}>
              Pág. <Text style={{ fontWeight: 'bold', color: '#2C3E50' }}>{paginaSegura}</Text> de <Text style={{ fontWeight: 'bold', color: '#2C3E50' }}>{totalPaginas}</Text>{' '}
              ({inicioSlice + 1}-{Math.min(fimSlice, dados.itens.length)})
            </Text>

            <TouchableOpacity
              style={[styles.btnPaginacao, paginaSegura >= totalPaginas && styles.btnPaginacaoDesativado]}
              disabled={paginaSegura >= totalPaginas}
              onPress={() => setPaginaModal(prev => Math.min(totalPaginas, prev + 1))}
            >
              <Text style={styles.btnPaginacaoTexto}>Próxima</Text>
              <Ionicons name="chevron-forward" size={16} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* LISTA DE REGISTROS (MÁXIMO 50 POR PÁGINA PARA NÃO TRAVAR) */}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {itensPaginados.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="folder-open-outline" size={42} color="#BDC3C7" />
              <Text style={styles.textoVazio}>Nenhum registro encontrado.</Text>
            </View>
          ) : (
            itensPaginados.map((item, idx) => {
              const dtFormatada = converterParaUI(item.data || item.data_atestado) || 'Sem data';
              const isAbono = item.servico && item.servico.startsWith('Abono');

              return (
                <View
                  key={isOnlineModal ? item.id || idx : idx}
                  style={[
                    styles.itemCardOrganizado,
                    item._isDuplicado && styles.itemCardDuplicado
                  ]}
                >
                  {item._isDuplicado && (
                    <View style={styles.bannerDuplicado}>
                      <Ionicons name="warning" size={14} color="#FFF" />
                      <Text style={styles.bannerDuplicadoTexto}>
                        REGISTRO DUPLICADO ({item._ordemDuplicado} de {item._qtdDuplicados} nesta data: {dtFormatada})
                      </Text>
                    </View>
                  )}

                  <View style={styles.itemBodyRow}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemColab}>{item.colaborador}</Text>

                      <View style={styles.badgesRow}>
                        <View style={[styles.badgeTipo, isAbono ? styles.badgeAbono : styles.badgeAtestado]}>
                          <Text style={[styles.badgeTipoTexto, isAbono ? { color: '#34495E' } : { color: '#2980B9' }]}>
                            {item.servico}
                          </Text>
                        </View>

                        <View style={styles.badgeData}>
                          <Ionicons name="calendar-outline" size={12} color="#5D6D7E" />
                          <Text style={styles.badgeDataTexto}>{dtFormatada}</Text>
                        </View>
                      </View>

                      <View style={styles.metaRow}>
                        <Text style={styles.itemDetalhes}>
                          ⏱️ Duração: <Text style={{ fontWeight: 'bold' }}>{item.dias_atestado ? `${item.dias_atestado} dia(s)` : '1 dia'}</Text>
                        </Text>

                        {item.cid_atestado ? (
                          <Text style={styles.itemDetalhes}>
                            {'  |  '}🧬 CID: <Text style={{ fontWeight: 'bold', color: '#2C3E50' }}>{item.cid_atestado}</Text>
                          </Text>
                        ) : null}
                      </View>

                      {/* EXIBIÇÃO DE QUEM LANÇOU */}
                      <Text style={styles.itemFiscal}>
                        👤 Lançado por: <Text style={{ fontWeight: 'bold', color: '#34495E' }}>{item.fiscal_nome || 'Não informado'}</Text>
                      </Text>

                      <Text style={styles.itemValorPago}>
                        💰 Valor Pago: R$ {(Number(item.valor_total) || 0).toFixed(2).replace('.', ',')}
                      </Text>
                    </View>

                    <View style={styles.itemAcoesCol}>
                      <TouchableOpacity
                        style={styles.btnEditarOrganizado}
                        onPress={() => isOnlineModal ? prepararEdicaoOnline(item) : prepararEdicao(item._indexOriginal)}
                      >
                        <Ionicons name="create-outline" size={16} color="#FFF" />
                        <Text style={styles.btnAcaoLabel}>Editar</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.btnApagarOrganizado}
                        onPress={() => isOnlineModal ? excluirRegistroOnline(item.id) : excluirPendente(item._indexOriginal)}
                      >
                        <Ionicons name="trash-outline" size={16} color="#FFF" />
                        <Text style={styles.btnAcaoLabel}>Excluir</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{flex: 1}}>
        {isOffline && (
          <View style={styles.offlineBadge}>
            <Text style={styles.offlineText}>⚠️ MODO OFFLINE ATIVADO - Registros salvos no celular.</Text>
          </View>
        )}

        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">

          <View style={styles.topBar}>
            {perfilLogado ? (
              <Text style={styles.userText}>👤 {perfilLogado.cargo}: {perfilLogado.nome}</Text>
            ) : (
              <Text style={styles.userText}>Buscando perfil...</Text>
            )}
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>Controle de Ponto 📅</Text>
            <Text style={styles.subtitle}>Lançamento de Ocorrências e Faltas</Text>
          </View>

          {ausenciasPendentes.length > 0 && (
            <View style={styles.syncCard}>
              <Text style={styles.syncTexto}>📦 {ausenciasPendentes.length} {ausenciasPendentes.length === 1 ? 'registro aguardando' : 'registros aguardando'}</Text>
              <View style={styles.syncBotoesRow}>
                <TouchableOpacity style={styles.btnSyncVer} onPress={abrirModalPendentes}>
                  <Text style={styles.btnSyncVerTexto}>👁️ VER LISTA</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnSync} onPress={sincronizarComBanco} disabled={sincronizando || indexEdicao !== null || idEdicaoOnline !== null}>
                  {sincronizando ? <ActivityIndicator color="#F39C12" size="small" /> : <Text style={styles.btnSyncTexto}>🚀 ENVIAR TUDO</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={[styles.card, (indexEdicao !== null || idEdicaoOnline !== null) && { borderColor: '#F1C40F', borderWidth: 2 }]}>
            {carregandoDados ? (
              <View style={{alignItems: 'center', marginVertical: 20}}>
                <ActivityIndicator size="large" color="#3498DB" />
                <Text style={{marginTop: 10, color: '#7F8C8D'}}>Carregando equipe...</Text>
              </View>
            ) : (
              <>
                {(indexEdicao !== null || idEdicaoOnline !== null) && (
                  <View style={styles.edicaoAviso}>
                    <Text style={styles.edicaoAvisoTexto}>
                      ⚠️ EDITANDO {idEdicaoOnline !== null ? 'DADOS DA NUVEM' : 'DADOS OFFLINE'}
                    </Text>
                  </View>
                )}

                <Text style={styles.label}>Colaborador da sua Equipe:</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={colaborador} onValueChange={setColaborador} style={styles.picker}>
                    <Picker.Item label="Selecione quem ausentou..." value="" />
                    {listaColaboradores.map((item) => (
                      <Picker.Item key={item.id} label={item.nome} value={item.nome} />
                    ))}
                  </Picker>
                </View>

                <Text style={styles.label}>Tipo de Ocorrência:</Text>
                <View style={[styles.pickerContainer, { height: 60 }]}>
                  <Picker selectedValue={tipoAusencia} onValueChange={setTipoAusencia} style={styles.picker}>
                    <Picker.Item label="Atestado Médico" value="Atestado" />
                    <Picker.Item label="Abono" value="Abono" />
                    <Picker.Item label="Declaração" value="Declaração" />
                    <Picker.Item label="Declaração de Comparecimento" value="Declaração de Comparecimento" />
                    <Picker.Item label="Declaração de Horas" value="Declaração de Horas" />
                    <Picker.Item label="Afastamento" value="Afastamento" />
                    <Picker.Item label="Licença Nojo (Óbito)" value="Licença Nojo" />
                    <Picker.Item label="Licença Gala (Casamento)" value="Licença Gala" />
                    <Picker.Item label="Licença Maternidade" value="Licença Maternidade" />
                    <Picker.Item label="Licença Paternidade" value="Licença Paternidade" />
                  </Picker>
                </View>

                {tipoAusencia !== 'Abono' && (
                  <View style={styles.atestadoBox}>
                    <Text style={styles.atestadoTitulo}>
                      {tipoAusencia === 'Atestado' ? 'Detalhes do Atestado 🏥' : 'Detalhes da Ocorrência 📝'}
                    </Text>

                    <Text style={styles.label}>Data do Documento:</Text>
                    <TextInput 
                      style={styles.input} 
                      placeholder="DD/MM/AAAA" 
                      keyboardType="numeric"
                      maxLength={10}
                      value={dataOcorrencia} 
                      onChangeText={(t) => setDataOcorrencia(aplicarMascaraData(t))} 
                    />

                    <View style={styles.row}>
                      <View style={styles.col}>
                        <Text style={styles.label}>Qtd. de Dias:</Text>
                        <TextInput 
                          style={styles.input} 
                          placeholder="Ex: 3" 
                          keyboardType="numeric" 
                          value={diasOcorrencia} 
                          onChangeText={setDiasOcorrencia} 
                        />
                      </View>
                      <View style={styles.col}>
                        <Text style={styles.label}>Valor da Diária (R$):</Text>
                        <TextInput 
                          style={styles.input} 
                          placeholder="Ex: 61,51 (Ou vazio)" 
                          keyboardType="numeric" 
                          value={valorDiaria} 
                          onChangeText={setValorDiaria} 
                        />
                      </View>
                    </View>
                    
                    {tipoAusencia === 'Atestado' && (
                      <View style={{marginTop: 5}}>
                        <Text style={styles.label}>Código CID:</Text>
                        <TextInput 
                          style={styles.input} 
                          placeholder="Ex: J01.9" 
                          value={cidAtestado} 
                          onChangeText={setCidAtestado} 
                          autoCapitalize="characters"
                        />
                      </View>
                    )}
                  </View>
                )}

                {tipoAusencia === 'Abono' && (
                  <View style={styles.abonoBox}>
                    <Text style={styles.abonoTitulo}>Detalhes do Abono ✅</Text>

                    <Text style={styles.label}>Data da Ausência:</Text>
                    <TextInput 
                      style={styles.input} 
                      placeholder="DD/MM/AAAA" 
                      keyboardType="numeric"
                      maxLength={10}
                      value={dataAbono} 
                      onChangeText={(t) => setDataAbono(aplicarMascaraData(t))} 
                    />

                    <View style={styles.row}>
                      <View style={styles.col}>
                        <Text style={styles.label}>Motivo (Opcional):</Text>
                        <TextInput 
                          style={styles.input} 
                          placeholder="Ex: Doação de sangue..." 
                          value={motivoAbono} 
                          onChangeText={setMotivoAbono} 
                        />
                      </View>
                      <View style={styles.col}>
                        <Text style={styles.label}>Valor (R$):</Text>
                        <TextInput 
                          style={styles.input} 
                          placeholder="Ex: 61,51" 
                          keyboardType="numeric" 
                          value={valorDiaria} 
                          onChangeText={setValorDiaria} 
                        />
                      </View>
                    </View>
                  </View>
                )}

                <View style={[styles.avisoBox, tipoAusencia === 'Abono' ? styles.avisoAbono : styles.avisoAtestado]}>
                  <Text style={styles.avisoTexto}>
                    O valor financeiro lançado no banco será R$ {valorDiaria || '0,00'} por dia. (Total ajustado automaticamente).
                  </Text>
                </View>

                {indexEdicao !== null || idEdicaoOnline !== null ? (
                  <View style={styles.rowBotoesEdicao}>
                    <TouchableOpacity style={[styles.button, styles.btnCancelarEdicao]} onPress={cancelarEdicao}>
                      <Text style={styles.buttonText}>❌ CANCELAR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.button, styles.btnSalvarEdicao, salvando && styles.buttonDisabled]} onPress={salvarAusencia} disabled={salvando}>
                      {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>{idEdicaoOnline !== null ? '☁️ ATUALIZAR' : '💾 SALVAR'}</Text>}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity 
                    style={[styles.button, salvando ? styles.buttonDisabled : null, tipoAusencia === 'Abono' ? styles.btnAbono : styles.btnAtestado]} 
                    onPress={salvarAusencia} 
                    disabled={salvando}
                  >
                    {salvando ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.buttonText}>Salvar Registro no Aparelho</Text>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.buttonAtualizar} onPress={() => carregarDadosBase(perfilLogado)}>
                  <Text style={styles.buttonAtualizarText}>↻ Recarregar Equipe</Text>
                </TouchableOpacity>

                {!isOffline && indexEdicao === null && idEdicaoOnline === null && (
                  <TouchableOpacity style={styles.btnHistorico} onPress={abrirHistoricoOnline}>
                    <Ionicons name="cloud-download-outline" size={18} color="#FFF" style={{marginRight: 8}} />
                    <Text style={styles.btnHistoricoTexto}>EDITAR HISTÓRICO DA NUVEM</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
          <View style={{height: 50}} /> 
        </ScrollView>

        {/* MODAL 1: PENDENTES NO APARELHO */}
        <Modal visible={modalPendentesVisivel} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContentGrande}>
              {renderConteudoModalOrganizado(dadosModalOffline, 'Ocorrências Pendentes 📦', false)}

              <TouchableOpacity style={styles.btnFecharModal} onPress={() => setModalPendentesVisivel(false)}>
                <Text style={styles.btnFecharTexto}>VOLTAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* MODAL 2: HISTÓRICO NA NUVEM */}
        <Modal visible={modalOnlineVisivel} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContentGrande}>
              {carregandoOnline ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#8E44AD" />
                  <Text style={{ textAlign: 'center', marginTop: 12, color: '#7F8C8D', fontWeight: '600' }}>
                    Buscando no banco de dados...
                  </Text>
                </View>
              ) : (
                renderConteudoModalOrganizado(dadosModalOnline, 'Histórico na Nuvem ☁️', true)
              )}

              <TouchableOpacity style={styles.btnFecharModal} onPress={() => setModalOnlineVisivel(false)}>
                <Text style={styles.btnFecharTexto}>FECHAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', padding: 20 },
  offlineBadge: { backgroundColor: '#E74C3C', padding: 8, alignItems: 'center', justifyContent: 'center' },
  offlineText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  topBar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 15, marginBottom: 5, backgroundColor: '#FFF', padding: 12, borderRadius: 8, elevation: 2 },
  userText: { fontSize: 14, fontWeight: 'bold', color: '#2C3E50', textAlign: 'center' },
  header: { marginBottom: 20, marginTop: 10, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 16, color: '#7F8C8D', marginTop: 5 },

  syncCard: { backgroundColor: '#F39C12', padding: 15, borderRadius: 12, marginBottom: 20, alignItems: 'center' },
  syncTexto: { color: '#FFF', fontWeight: 'bold', marginBottom: 10 },
  syncBotoesRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  btnSyncVer: { backgroundColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8, flex: 1, marginRight: 10, alignItems: 'center' },
  btnSyncVerTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  btnSync: { backgroundColor: '#FFF', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8, flex: 1, alignItems: 'center' },
  btnSyncTexto: { color: '#F39C12', fontWeight: 'bold', fontSize: 12 },

  card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 15, elevation: 5 },
  label: { fontSize: 14, fontWeight: '700', color: '#34495E', marginBottom: 5, marginTop: 15 },
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', overflow: 'hidden', justifyContent: 'center' },
  picker: { height: 50, width: '100%', borderWidth: 0, backgroundColor: 'transparent' },

  input: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#F8FAFC', color: '#2C3E50', height: 50 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { width: '48%' },

  atestadoBox: { backgroundColor: '#EBF5FB', padding: 15, borderRadius: 10, marginTop: 15, borderWidth: 1, borderColor: '#AED6F1' },
  atestadoTitulo: { fontSize: 16, fontWeight: 'bold', color: '#2980B9', marginBottom: 5, textAlign: 'center' },

  abonoBox: { backgroundColor: '#EAEDED', padding: 15, borderRadius: 10, marginTop: 15, borderWidth: 1, borderColor: '#BDC3C7' },
  abonoTitulo: { fontSize: 16, fontWeight: 'bold', color: '#34495E', marginBottom: 5, textAlign: 'center' },

  avisoBox: { padding: 15, borderRadius: 8, marginTop: 20, borderWidth: 1 },
  avisoAbono: { backgroundColor: '#EAEDED', borderColor: '#7F8C8D' },
  avisoAtestado: { backgroundColor: '#E8F8F5', borderColor: '#27AE60' },
  avisoTexto: { color: '#2C3E50', fontSize: 14, textAlign: 'center', fontWeight: '500' },

  button: { padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 25 },
  btnAbono: { backgroundColor: '#34495E' },
  btnAtestado: { backgroundColor: '#3498DB' },
  buttonDisabled: { backgroundColor: '#95A5A6' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  buttonAtualizar: { backgroundColor: '#E0E6ED', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  buttonAtualizarText: { color: '#34495E', fontSize: 14, fontWeight: 'bold' },

  btnHistorico: { backgroundColor: '#8E44AD', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 25, flexDirection: 'row', justifyContent: 'center' },
  btnHistoricoTexto: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },

  edicaoAviso: { backgroundColor: '#FCF3CF', padding: 10, borderRadius: 8, marginBottom: 15, alignItems: 'center' },
  edicaoAvisoTexto: { color: '#D35400', fontWeight: 'bold', fontSize: 12 },
  rowBotoesEdicao: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25 },
  btnCancelarEdicao: { flex: 1, marginRight: 10, backgroundColor: '#E74C3C', marginTop: 0 },
  btnSalvarEdicao: { flex: 1, backgroundColor: '#27AE60', marginTop: 0 },

  // ESTILOS DO MODAL ORGANIZADO
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 14 },
  modalContentGrande: { backgroundColor: '#FFF', width: '100%', maxWidth: 750, borderRadius: 16, padding: 16, elevation: 12, flex: 0.92 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E50' },
  modalSubtitle: { fontSize: 12, color: '#7F8C8D', marginTop: 2 },
  btnPdf: { backgroundColor: '#2C3E50', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, gap: 6 },
  btnPdfTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },

  // FAIXA DE DUPLICIDADE ÚNICA E INTUITIVA
  painelDuplicidade: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FDEDEC', borderWidth: 1, borderColor: '#E74C3C', borderRadius: 10, padding: 12, marginBottom: 12 },
  painelDuplicidadeAtivo: { backgroundColor: '#C0392B', borderColor: '#922B21' },
  painelDuplicidadeTitulo: { fontSize: 13, fontWeight: 'bold', color: '#C0392B' },
  painelDuplicidadeSub: { fontSize: 11, color: '#922B21', marginTop: 2 },
  btnAlternarDuplicados: { backgroundColor: '#E74C3C', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  btnAlternarDuplicadosAtivo: { backgroundColor: '#FFFFFF' },
  btnAlternarDuplicadosTexto: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 11 },

  painelSemDuplicidade: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E8F8F5', borderWidth: 1, borderColor: '#A3E4D7', borderRadius: 10, padding: 10, marginBottom: 12 },
  painelSemDuplicidadeTexto: { fontSize: 12, color: '#1E8449', fontWeight: '600' },

  barraBuscaEResumo: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#D5DBDB', borderRadius: 10, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 14, color: '#2C3E50' },
  caixaSomaTotal: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#D5DBDB', borderRadius: 10, paddingHorizontal: 12, height: 44, justifyContent: 'center', alignItems: 'flex-end' },
  caixaSomaLabel: { fontSize: 10, color: '#7F8C8D', fontWeight: '600' },
  caixaSomaValor: { fontSize: 13, color: '#27AE60', fontWeight: 'bold' },

  // PAGINAÇÃO 50 EM 50
  paginacaoContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F0F4F8', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#D5DBDB' },
  btnPaginacao: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#8E44AD', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, gap: 4 },
  btnPaginacaoDesativado: { backgroundColor: '#BDC3C7' },
  btnPaginacaoTexto: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  paginacaoInfo: { fontSize: 12, color: '#5D6D7E' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  textoVazio: { textAlign: 'center', color: '#7F8C8D', marginTop: 8, fontSize: 14 },

  itemCardOrganizado: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  itemCardDuplicado: { borderColor: '#E74C3C', borderWidth: 2, backgroundColor: '#FFFDFD' },
  bannerDuplicado: { backgroundColor: '#E74C3C', paddingVertical: 5, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerDuplicadoTexto: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },

  itemBodyRow: { flexDirection: 'row', padding: 12, alignItems: 'center' },
  itemInfo: { flex: 1, paddingRight: 8 },
  itemColab: { fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 6 },

  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  badgeTipo: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeAtestado: { backgroundColor: '#EBF5FB' },
  badgeAbono: { backgroundColor: '#EAEDED' },
  badgeTipoTexto: { fontSize: 11, fontWeight: 'bold' },

  badgeData: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F2F4F4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeDataTexto: { fontSize: 11, fontWeight: '600', color: '#34495E' },

  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  itemDetalhes: { fontSize: 12, color: '#5D6D7E' },
  itemFiscal: { fontSize: 12, color: '#5D6D7E', marginTop: 4 },
  itemValorPago: { fontSize: 13, color: '#27AE60', fontWeight: 'bold', marginTop: 6 },

  itemAcoesCol: { justifyContent: 'center', gap: 8 },
  btnEditarOrganizado: { backgroundColor: '#F39C12', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  btnApagarOrganizado: { backgroundColor: '#E74C3C', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  btnAcaoLabel: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },

  btnFecharModal: { backgroundColor: '#7F8C8D', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  btnFecharTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 14 }
});