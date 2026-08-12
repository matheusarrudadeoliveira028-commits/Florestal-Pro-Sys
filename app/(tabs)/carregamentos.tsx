import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import * as Print from 'expo-print';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, InteractionManager, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

// =========================================================================
// COMPONENTE MEMOIZADO: ITEM DO RELATÓRIO
// =========================================================================
const ItemRelatorioCard = memo(({ romaneio, isAdmin, onEditar }: any) => {
  const mediaCalculada = romaneio.totalPeso > 0 && romaneio.totalQtd > 0 ? (romaneio.totalPeso / romaneio.totalQtd).toFixed(2).replace('.', ',') : '-';
  
  return (
    <View style={styles.itemRelatorio}>
      <View style={{flex: 1}}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
          <Text style={{fontWeight: 'bold', color: '#2C3E50', fontSize: 15}}>Romaneio: {romaneio.numero_romaneio}</Text>
          <Text style={{fontSize: 12, fontWeight: 'bold', color: romaneio.tipo_carga === 'Madeira' ? '#8E44AD' : '#F39C12'}}>{romaneio.tipo_carga}</Text>
        </View>
        <Text style={{fontSize: 12, color: '#7F8C8D', marginBottom: 5}}>Data: {romaneio.data_saida.split('-').reverse().join('/')}</Text>
        
        <View style={styles.lotesResumo}>
          {romaneio.itens.map((i: any, index: number) => (
            <Text key={index} style={{fontSize: 11, color: '#34495E'}}>
              • {romaneio.tipo_carga === 'Madeira' ? '' : `${i.quantidade}x `}{i.variedade} ({i.fazenda})
            </Text>
          ))}
        </View>

        <Text style={{fontSize: 13, color: romaneio.totalPeso > 0 || romaneio.madeira_volume > 0 ? '#27AE60' : '#E67E22', fontWeight: 'bold', marginTop: 5}}>
          {romaneio.tipo_carga === 'Madeira' 
            ? `Volume: ${romaneio.madeira_volume ? romaneio.madeira_volume.toFixed(2).replace('.', ',') : '0'} st`
            : `Total: ${romaneio.totalQtd} Tb | Peso Líq: ${romaneio.totalPeso > 0 ? `${romaneio.totalPeso.toFixed(2).replace('.', ',')} Kg` : 'Pendente'}`
          }
        </Text>
        {romaneio.tipo_carga === 'Goma Resina' && romaneio.totalPeso > 0 && <Text style={{fontSize: 11, color: '#27AE60'}}>Média: {mediaCalculada} Kg/Tb</Text>}
      </View>
      
      {isAdmin && (
        <TouchableOpacity style={styles.btnEditarPequeno} onPress={() => onEditar(romaneio)}>
          <Text style={{color: '#FFF', fontSize: 13, fontWeight: 'bold', textAlign: 'center'}}>✏️ Editar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// =========================================================================
// TELA PRINCIPAL
// =========================================================================
export default function CarregamentosScreen() {
  const [abaAtiva, setAbaAtiva] = useState<'novo' | 'remocao' | 'relatorio'>('novo');

  const [isAdmin, setIsAdmin] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [carregamentosPendentes, setCarregamentosPendentes] = useState<any[]>([]);
  const [remocoesPendentes, setRemocoesPendentes] = useState<any[]>([]);
  const [sincronizando, setSincronizando] = useState(false);

  // 👉 ESTADOS GERAIS DO ROMANEIO
  const [romaneioEditando, setRomaneioEditando] = useState<string | null>(null);
  const [dataSaida, setDataSaida] = useState('');
  const [numeroRomaneio, setNumeroRomaneio] = useState('');
  const [tipoCarga, setTipoCarga] = useState('Goma Resina'); 
  const [tipoOperacao, setTipoOperacao] = useState('Compra'); 
  
  // 👉 DADOS DE TRANSPORTE E PROCEDÊNCIA (Carregamento)
  const [motorista, setMotorista] = useState('');
  const [placa, setPlaca] = useState('');
  const [horaEntrada, setHoraEntrada] = useState('');
  const [horaSaida, setHoraSaida] = useState('');
  const [procedenciaTipo, setProcedenciaTipo] = useState('Produção Própria');
  const [procedenciaNome, setProcedenciaNome] = useState('');
  const [localQuadra, setLocalQuadra] = useState('');
  const [observacao, setObservacao] = useState('');

  // 👉 DADOS DE MADEIRA (Dimensões)
  const [alturaMedia, setAlturaMedia] = useState('');
  const [largura, setLargura] = useState('');
  const [comprimento, setComprimento] = useState('');
  const [volume, setVolume] = useState('');

  // 👉 DADOS DE PESAGEM GLOBAL
  const [pesoBruto, setPesoBruto] = useState('');
  const [tara, setTara] = useState('');
  const [pesoLiquidoTotal, setPesoLiquidoTotal] = useState('');
  const [mediaGeral, setMediaGeral] = useState('0,00');

  // 👉 CARRINHO DE LOTES (Fazendas e Qtd)
  const [itemFazenda, setItemFazenda] = useState('');
  const [itemVariedade, setItemVariedade] = useState('Elliotti');
  const [itemQuantidade, setItemQuantidade] = useState('');
  const [itensCarga, setItensCarga] = useState<any[]>([]);
  
  // 🟢 ESTADOS DA NOVA ABA: REMOÇÃO
  const [dataRemocao, setDataRemocao] = useState('');
  const [fazendaRemocao, setFazendaRemocao] = useState('');
  const [quadraRemocao, setQuadraRemocao] = useState('');
  const [ramalRemocao, setRamalRemocao] = useState('');
  const [qtdRemocao, setQtdRemocao] = useState('');
  const [obsRemocao, setObsRemocao] = useState('');

  const [listaFazendas, setListaFazendas] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [listaRelatorioAgrupada, setListaRelatorioAgrupada] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [gerandoPDF, setGerandoPDF] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const tarefa = InteractionManager.runAfterInteractions(() => {
        verificarPerfil();
        carregarFazendas();
        carregarFilaOffline();
      });
      return () => tarefa.cancel();
    }, [])
  );

  useEffect(() => {
    const hoje = new Date();
    setDataSaida(hoje.toLocaleDateString('pt-BR'));
    setDataRemocao(hoje.toLocaleDateString('pt-BR'));
    
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    setDataInicio(primeiroDia.toLocaleDateString('pt-BR'));
    setDataFim(ultimoDia.toLocaleDateString('pt-BR'));
  }, []);

  const totalTamboresCarga = itensCarga.reduce((acc, curr) => acc + parseInt(curr.quantidade || '0'), 0);

  // 🧮 CALCULO AUTOMÁTICO DE PESO LÍQUIDO
  useEffect(() => {
    const b = parseFloat(pesoBruto.replace(',', '.')) || 0;
    const t = parseFloat(tara.replace(',', '.')) || 0;
    if (b > 0) {
      const liq = b - t;
      setPesoLiquidoTotal(liq > 0 ? liq.toFixed(2).replace('.', ',') : '');
    }
  }, [pesoBruto, tara]);

  // 🧮 CALCULO AUTOMÁTICO DE MÉDIA DE TAMBOR
  useEffect(() => {
    const pesoNum = parseFloat(pesoLiquidoTotal.replace(',', '.')) || 0;
    if (totalTamboresCarga > 0 && pesoNum > 0) {
      const media = pesoNum / totalTamboresCarga;
      setMediaGeral(media.toFixed(2).replace('.', ','));
    } else {
      setMediaGeral('0,00');
    }
  }, [itensCarga, pesoLiquidoTotal]);

  // 🧮 CALCULO AUTOMÁTICO DO VOLUME DA MADEIRA
  useEffect(() => {
    const a = parseFloat(alturaMedia.replace(',', '.')) || 0;
    const l = parseFloat(largura.replace(',', '.')) || 0;
    const c = parseFloat(comprimento.replace(',', '.')) || 0;
    if (a > 0 && l > 0 && c > 0) {
      setVolume((a * l * c).toFixed(2).replace('.', ','));
    } else {
      setVolume('');
    }
  }, [alturaMedia, largura, comprimento]);

  const verificarPerfil = async () => {
    try {
      const perfilSalvo = await AsyncStorage.getItem('@perfil_offline');
      if (perfilSalvo) {
        const perfil = JSON.parse(perfilSalvo);
        const cargo = perfil.cargo ? perfil.cargo.trim().toLowerCase() : '';
        setIsAdmin(cargo === 'administrador');
      }
    } catch (e) {
      setIsAdmin(false);
    }
  };

  const carregarFilaOffline = async () => {
    try {
      const dadosCarregamentos = await AsyncStorage.getItem('@carregamentos_off');
      if (dadosCarregamentos) setCarregamentosPendentes(JSON.parse(dadosCarregamentos));

      const dadosRemocoes = await AsyncStorage.getItem('@remocoes_off');
      if (dadosRemocoes) setRemocoesPendentes(JSON.parse(dadosRemocoes));
    } catch (e) { console.log(e); }
  };

  const carregarFazendas = async () => {
    try {
      const { data, error } = await supabase.from('mapa_fazendas').select('fazenda');
      if (error) throw new Error("Offline");
      
      if (data) {
        const unicas = [...new Set(data.map(item => item.fazenda))] as string[];
        setListaFazendas(unicas);
        await AsyncStorage.setItem('@mochila_fazendas_simples', JSON.stringify(unicas));
      }
      setIsOffline(false);
    } catch (e) {
      setIsOffline(true);
      const fazOffline = await AsyncStorage.getItem('@mochila_fazendas_simples');
      if (fazOffline) setListaFazendas(JSON.parse(fazOffline));
    }
  };

  const aplicarMascaraData = (texto: string) => {
    let v = texto.replace(/\D/g, ''); 
    if (v.length > 8) v = v.substring(0, 8); 
    if (v.length > 4) v = v.replace(/^(\d{2})(\d{2})(\d{1,4}).*/, '$1/$2/$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{1,2}).*/, '$1/$2');
    return v;
  };

  const aplicarMascaraHora = (texto: string) => {
    let v = texto.replace(/\D/g, '');
    if (v.length > 4) v = v.substring(0, 4);
    if (v.length > 2) v = v.replace(/^(\d{2})(\d{1,2})/, '$1:$2');
    return v;
  };

  // 🟢 CORRETOR DE DATAS: Previne o ano com 2 dígitos de explodir o banco
  const converterDataBanco = (dataBR: string) => {
    if (!dataBR) return null;
    const p = dataBR.split('/');
    if (p.length === 3) {
      let ano = p[2];
      if (ano.length === 2) ano = `20${ano}`; // Se digitar 26, vira 2026.
      return `${ano}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
    }
    return null;
  };

  // 🟢 UTILITÁRIO PARA CORRIGIR DATAS PRESAS NA FILA OFFLINE
  const corrigirDataFila = (dataOriginal: string) => {
    if (!dataOriginal) return dataOriginal;
    const partes = dataOriginal.split('-');
    // Se o banco tentar enviar "26-08-05", conserta para "2026-08-05"
    if (partes.length === 3 && partes[0].length === 2) {
      return `20${partes[0]}-${partes[1]}-${partes[2]}`;
    }
    return dataOriginal;
  };

  const adicionarItem = () => {
    if (!itemFazenda) {
      return Alert.alert("Aviso", "Selecione a Fazenda!");
    }
    // Se for Goma Resina, a quantidade é obrigatória
    if (tipoCarga !== 'Madeira' && !itemQuantidade) {
      return Alert.alert("Aviso", "Informe a Quantidade de Tambores!");
    }

    setItensCarga([...itensCarga, { 
      id_temp: Date.now().toString(),
      fazenda: itemFazenda, 
      variedade: itemVariedade, 
      quantidade: tipoCarga === 'Madeira' ? '0' : itemQuantidade 
    }]);
    
    setItemFazenda('');
    setItemQuantidade('');
  };

  const removerItem = (idTemp: string) => {
    setItensCarga(itensCarga.filter(i => i.id_temp !== idTemp));
  };

  // 🟢 SALVAR CARREGAMENTO (EXPEDIÇÃO)
  const salvarCarregamento = async () => {
    if (!dataSaida || !numeroRomaneio) return Alert.alert("Aviso", "Preencha a Data e o Nº do Romaneio!");
    if (itensCarga.length === 0) return Alert.alert("Aviso", "Adicione pelo menos uma Fazenda de origem (Lote)!");

    const dataBd = converterDataBanco(dataSaida);
    if (!dataBd) return Alert.alert("Aviso", "Data inválida.");

    if (romaneioEditando && isOffline) {
      return Alert.alert("Aviso Offline", "Não é possível editar um romaneio existente sem internet.");
    }

    setSalvando(true);

    const pesoNum = pesoLiquidoTotal ? parseFloat(pesoLiquidoTotal.replace(',', '.')) : null;
    const pesoBrutoNum = pesoBruto ? parseFloat(pesoBruto.replace(',', '.')) : null;
    const taraNum = tara ? parseFloat(tara.replace(',', '.')) : null;
    const mediaCalculada = pesoNum && totalTamboresCarga > 0 ? pesoNum / totalTamboresCarga : null;

    const volNum = volume ? parseFloat(volume.replace(',', '.')) : null;
    const altNum = alturaMedia ? parseFloat(alturaMedia.replace(',', '.')) : null;
    const largNum = largura ? parseFloat(largura.replace(',', '.')) : null;
    const compNum = comprimento ? parseFloat(comprimento.replace(',', '.')) : null;

    const payloadMultiplo = itensCarga.map(item => {
      const qtdLote = parseInt(item.quantidade) || 0;
      return {
        data_saida: dataBd,
        numero_romaneio: numeroRomaneio,
        tipo_carga: tipoCarga,
        tipo_operacao: tipoOperacao,
        motorista: motorista,
        placa: placa,
        hora_entrada: horaEntrada,
        hora_saida: horaSaida,
        procedencia_tipo: procedenciaTipo,
        procedencia_nome: procedenciaTipo === 'Parceiro Extrator' ? procedenciaNome : null,
        local_quadra: localQuadra,
        fazenda: item.fazenda,
        variedade: item.variedade,
        quantidade: qtdLote,
        peso_bruto: pesoBrutoNum,
        tara: taraNum,
        peso_liquido: tipoCarga === 'Goma Resina' && mediaCalculada ? mediaCalculada * qtdLote : pesoNum,
        media_tambor: mediaCalculada,
        madeira_altura: altNum,
        madeira_largura: largNum,
        madeira_comprimento: compNum,
        madeira_volume: volNum,
        observacao: observacao
      };
    });

    try {
      const novoPendente = {
        id_fila: Date.now().toString(),
        isEdit: !!romaneioEditando,
        romaneioOriginal: romaneioEditando,
        payload: payloadMultiplo
      };

      const novaLista = [...carregamentosPendentes, novoPendente];
      await AsyncStorage.setItem('@carregamentos_off', JSON.stringify(novaLista));
      setCarregamentosPendentes(novaLista);

      Alert.alert(
        "Sucesso", 
        romaneioEditando ? "Carga atualizada (adicionada à fila)!" : "Nota de Romaneio salva na fila!", 
        [
          { text: "Ver PDF / Imprimir", onPress: () => gerarPdfRomaneio(payloadMultiplo) },
          { text: "OK", style: "cancel" }
        ]
      );
      
      limparFormularioCarregamento();
    } catch (error) {
      Alert.alert("Erro", "Falha ao salvar carregamento no celular.");
    } finally {
      setSalvando(false);
    }
  };

  // 🟢 SALVAR REMOÇÃO
  const salvarRemocao = async () => {
    if (!dataRemocao || !fazendaRemocao || !quadraRemocao || !qtdRemocao) {
      return Alert.alert("Aviso", "Preencha Data, Fazenda, Quadra e a Quantidade de tambores!");
    }
    const dataBd = converterDataBanco(dataRemocao);
    if (!dataBd) return Alert.alert("Aviso", "Data inválida.");

    setSalvando(true);
    
    const payload = {
      data: dataBd,
      fazenda: fazendaRemocao,
      quadra: quadraRemocao,
      ramal: ramalRemocao || '-', 
      servico: 'REMOÇÃO',
      quantidade: parseInt(qtdRemocao),
      colaborador: 'EQUIPE DE REMOÇÃO',
      observacao: obsRemocao || '',
      valor_unitario: 0,
      valor_total: 0,
      tipo_resina: '-',
      fiscal_nome: 'SISTEMA'
    };

    try {
      const novaLista = [...remocoesPendentes, payload];
      await AsyncStorage.setItem('@remocoes_off', JSON.stringify(novaLista));
      setRemocoesPendentes(novaLista);
      Alert.alert("Sucesso", "Remoção salva na fila e pronta para envio!");
      
      setQuadraRemocao('');
      setRamalRemocao('');
      setQtdRemocao('');
      setObsRemocao('');
    } catch (e) {
      Alert.alert("Erro", "Falha ao salvar a remoção no celular.");
    } finally {
      setSalvando(false);
    }
  };

  const sincronizarGeralComBanco = async () => {
    if (carregamentosPendentes.length === 0 && remocoesPendentes.length === 0) return;
    setSincronizando(true);

    try {
      // Sincroniza Carregamentos
      if (carregamentosPendentes.length > 0) {
        for (const item of carregamentosPendentes) {
          if (item.isEdit && item.romaneioOriginal) {
            await supabase.from('carregamentos').delete().eq('numero_romaneio', item.romaneioOriginal);
          }
          // 🟢 VACINA DATA: Arruma a data caso tenha sido salva com o ano com 2 dígitos
          const payloadVacinado = item.payload.map((p: any) => ({
            ...p,
            data_saida: corrigirDataFila(p.data_saida)
          }));

          const { error } = await supabase.from('carregamentos').insert(payloadVacinado);
          if (error) throw new Error(`Carregamento: ${error.message}`);
        }
        await AsyncStorage.removeItem('@carregamentos_off');
        setCarregamentosPendentes([]);
      }

      // Sincroniza Remoções
      if (remocoesPendentes.length > 0) {
        // 🟢 VACINA DATA E CAMPOS OBRIGATÓRIOS
        const remocoesCorrigidas = remocoesPendentes.map(item => ({
          ...item,
          data: corrigirDataFila(item.data),
          colaborador: item.colaborador || 'EQUIPE DE REMOÇÃO',
          ramal: item.ramal || '-',
          valor_unitario: item.valor_unitario || 0,
          valor_total: item.valor_total || 0,
          fiscal_nome: item.fiscal_nome || 'SISTEMA',
          tipo_resina: item.tipo_resina || '-',
          observacao: item.observacao || ''
        }));

        const { error } = await supabase.from('diarios_campo').insert(remocoesCorrigidas);
        if (error) throw new Error(`Remoção: ${error.message}`);
        
        await AsyncStorage.removeItem('@remocoes_off');
        setRemocoesPendentes([]);
      }

      Alert.alert("🚀 Sucesso!", "Todos os dados foram enviados para a nuvem.");
      if (abaAtiva === 'relatorio') buscarRelatorio();

    } catch (e: any) {
      Alert.alert("Erro na Sincronização", "A internet falhou ou banco recusou: \n" + e.message);
    } finally {
      setSincronizando(false);
    }
  };

  const limparFormularioCarregamento = () => {
    setRomaneioEditando(null);
    setNumeroRomaneio(''); 
    setProcedenciaNome('');
    setItensCarga([]);
    setPesoBruto('');
    setTara('');
    setPesoLiquidoTotal('');
    setObservacao(''); 
    setMotorista('');
    setPlaca('');
    setHoraEntrada('');
    setHoraSaida('');
    setLocalQuadra('');
    setAlturaMedia('');
    setLargura('');
    setComprimento('');
    setVolume('');
  };

  const editarCarga = useCallback((romaneioAgrupado: any) => {
    const base = romaneioAgrupado; 
    
    setRomaneioEditando(base.numero_romaneio);
    setDataSaida(base.data_saida.split('-').reverse().join('/'));
    setNumeroRomaneio(base.numero_romaneio);
    setTipoCarga(base.tipo_carga || 'Goma Resina');
    setTipoOperacao(base.tipo_operacao || 'Compra');
    setProcedenciaTipo(base.procedencia_tipo);
    setProcedenciaNome(base.procedencia_nome || '');
    setLocalQuadra(base.local_quadra || '');
    setMotorista(base.motorista || '');
    setPlaca(base.placa || '');
    setHoraEntrada(base.hora_entrada || '');
    setHoraSaida(base.hora_saida || '');
    setObservacao(base.observacao || ''); 
    
    setPesoBruto(base.peso_bruto ? base.peso_bruto.toString().replace('.', ',') : '');
    setTara(base.tara ? base.tara.toString().replace('.', ',') : '');
    setPesoLiquidoTotal(base.totalPeso > 0 ? base.totalPeso.toFixed(2).replace('.', ',') : '');

    setAlturaMedia(base.madeira_altura ? base.madeira_altura.toString().replace('.', ',') : '');
    setLargura(base.madeira_largura ? base.madeira_largura.toString().replace('.', ',') : '');
    setComprimento(base.madeira_comprimento ? base.madeira_comprimento.toString().replace('.', ',') : '');
    setVolume(base.madeira_volume ? base.madeira_volume.toString().replace('.', ',') : '');
    
    const carrinhoRecriado = base.itens.map((i: any, index: number) => ({
      id_temp: index.toString(),
      fazenda: i.fazenda,
      variedade: i.variedade,
      quantidade: i.quantidade.toString()
    }));
    
    setItensCarga(carrinhoRecriado);
    setAbaAtiva('novo');
  }, []);

  const gerarPdfRomaneio = async (linhas: any[]) => {
    if (linhas.length === 0) return;
    setGerandoPDF(true);

    const base = linhas[0];
    const qtdTotalCalc = linhas.reduce((acc, curr) => acc + (curr.quantidade || 0), 0);
    const pesoLiquidoVal = base.peso_liquido || 0;
    
    const checkMadeira = base.tipo_carga === 'Madeira' ? '☑' : '☐';
    const checkResina = base.tipo_carga === 'Goma Resina' ? '☑' : '☐';
    const checkCompra = base.tipo_operacao === 'Compra' ? '☑' : '☐';
    const checkTransferencia = base.tipo_operacao === 'Transferência' ? '☑' : '☐';

    const fazendasArray = [...new Set(linhas.map(l => l.fazenda))];
    const fazendasNomes = fazendasArray.join(' / ');

    const htmlContent = `
      <html>
        <head>
          <style>
            @page { margin: 10mm; size: A4 portrait; }
            body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 0; color: #000; font-size: 14px; }
            .ticket { border: 2px solid #000; padding: 20px; width: 100%; max-width: 600px; margin: 0 auto; }
            .header-box { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
            .header-title { font-size: 18px; font-weight: bold; margin: 0; text-transform: uppercase; }
            .header-cnpj { font-size: 14px; margin: 5px 0 0 0; }
            .romaneio-title { text-align: center; font-size: 20px; font-weight: bold; margin: 15px 0; }
            .romaneio-number { color: #D32F2F; font-size: 24px; float: right; margin-top: -35px; margin-right: 10px; }
            
            .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .line-bottom { border-bottom: 1px solid #000; display: inline-block; flex-grow: 1; margin-left: 5px; min-height: 18px; }
            .check-box { font-family: monospace; font-size: 18px; margin-right: 5px; }
            
            .grid-pesagem { display: flex; justify-content: space-between; margin-top: 20px; margin-bottom: 20px; }
            .col-pesagem { width: 48%; }
            .pesagem-item { display: flex; align-items: flex-end; margin-bottom: 10px; }
            
            .signatures { display: flex; justify-content: space-between; margin-top: 60px; text-align: center; }
            .sign-line { border-top: 1px solid #000; width: 45%; padding-top: 5px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="ticket">
            <div class="header-box">
              <h2 class="header-title">LUIZ FELIPE AREOVALDO CALHIM MANOEL ABUD</h2>
              <p class="header-cnpj">CNPJ 08.396.358/0007-82</p>
            </div>
            
            <div class="romaneio-title">ROMANEIO</div>
            <div class="romaneio-number">${base.numero_romaneio}</div>
            
            <h3 style="margin-top: 0; text-transform: uppercase;">FAZENDA ${fazendasNomes}</h3>
            
            <div class="row">
              <span style="font-weight: bold;">LOCAL:</span> 
              <span class="line-bottom">${base.local_quadra || ''}</span>
            </div>

            <div style="background-color: #EEE; padding: 10px; margin-top: 15px; margin-bottom: 15px;">
              <div style="font-weight: bold; font-size: 16px; margin-bottom: 5px;"><span class="check-box">${checkMadeira}</span> MADEIRA</div>
              <div style="font-weight: bold; font-size: 16px;"><span class="check-box">${checkResina}</span> GOMA RESINA</div>
            </div>

            <div class="grid-pesagem">
              <div class="col-pesagem">
                <div class="pesagem-item">Altura Média: <span class="line-bottom" style="text-align:center;">${base.madeira_altura || ''}</span> m</div>
                <div class="pesagem-item">Largura: <span class="line-bottom" style="text-align:center;">${base.madeira_largura || ''}</span> m</div>
                <div class="pesagem-item">Comprimento: <span class="line-bottom" style="text-align:center;">${base.madeira_comprimento || ''}</span> m</div>
                <div class="pesagem-item">Volume: <span class="line-bottom" style="text-align:center;">${base.madeira_volume || ''}</span> st</div>
              </div>
              <div class="col-pesagem">
                <div class="pesagem-item">Tambores: <span class="line-bottom" style="text-align:center;">${qtdTotalCalc > 0 ? qtdTotalCalc : ''}</span> Unidade</div>
                <div class="pesagem-item">Peso Bruto: <span class="line-bottom" style="text-align:center;">${base.peso_bruto || ''}</span> kg</div>
                <div class="pesagem-item">Tara: <span class="line-bottom" style="text-align:center;">${base.tara || ''}</span> kg</div>
                <div class="pesagem-item" style="font-weight: bold;">Peso Líquido: <span class="line-bottom" style="text-align:center;">${pesoLiquidoVal > 0 ? pesoLiquidoVal : ''}</span> kg</div>
              </div>
            </div>

            <div class="row" style="margin-top: 20px;">
              <span style="font-weight: bold;">Motorista:</span> <span class="line-bottom">${base.motorista || ''}</span>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-top: 15px;">
              <div style="width: 50%;">
                <div class="row" style="margin-bottom: 15px;">
                  <span style="font-weight: bold;">Placa:</span> <span class="line-bottom">${base.placa || ''}</span>
                </div>
                <div><span class="check-box">${checkCompra}</span> Compra</div>
                <div><span class="check-box">${checkTransferencia}</span> Transferência</div>
              </div>
              
              <div style="width: 45%;">
                <div class="row">
                  <span style="font-weight: bold;">Hora Entrada:</span> <span class="line-bottom" style="text-align:center;">${base.hora_entrada || ''}</span>
                </div>
                <div class="row">
                  <span style="font-weight: bold;">Hora Saída:</span> <span class="line-bottom" style="text-align:center;">${base.hora_saida || ''}</span>
                </div>
                <div class="row">
                  <span style="font-weight: bold;">Data:</span> <span class="line-bottom" style="text-align:center;">${dataSaida}</span>
                </div>
              </div>
            </div>

            ${base.observacao ? `<div style="margin-top: 20px; font-size: 12px;"><strong>Obs:</strong> ${base.observacao}</div>` : ''}

            <div class="signatures">
              <div class="sign-line">Entregador</div>
              <div class="sign-line">Recebedor</div>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (e) {
      Alert.alert("Erro", "Falha ao gerar PDF.");
    } finally {
      setGerandoPDF(false);
    }
  };

  const buscarRelatorio = async () => {
    const dtIn = converterDataBanco(dataInicio);
    const dtFim = converterDataBanco(dataFim);

    if (!dtIn || !dtFim) return Alert.alert("Aviso", "Datas inválidas.");
    if (isOffline) return Alert.alert("Aviso", "É necessário internet para consultar os relatórios antigos.");

    setBuscando(true);
    const { data, error } = await supabase
      .from('carregamentos')
      .select('*')
      .gte('data_saida', dtIn)
      .lte('data_saida', dtFim)
      .order('data_saida', { ascending: false });

    if (error) {
      Alert.alert("Erro", "Falha na busca.");
    } else if (data) {
      const agrupado = data.reduce((acc: any, curr: any) => {
        const chave = curr.numero_romaneio;
        if (!acc[chave]) {
          acc[chave] = {
            ...curr,
            itens: [],
            totalQtd: 0,
            totalPeso: 0
          };
        }
        acc[chave].itens.push(curr);
        acc[chave].totalQtd += curr.quantidade;
        acc[chave].totalPeso += (curr.peso_liquido || 0);
        return acc;
      }, {});
      
      setListaRelatorioAgrupada(Object.values(agrupado));
    }
    setBuscando(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 50 }} keyboardShouldPersistTaps="handled">
        
        {isOffline && (
          <View style={styles.offlineBadge}>
            <Text style={styles.offlineText}>⚠️ MODO OFFLINE ATIVADO - Lançamentos salvos no celular.</Text>
          </View>
        )}

        <View style={styles.header}>
          <Text style={styles.title}>Expedição & Remoção 🚛</Text>
          <Text style={styles.subtitle}>Gestão Operacional de Movimentação</Text>
        </View>

        <View style={styles.menuAbas}>
          <TouchableOpacity style={[styles.abaBotao, abaAtiva === 'novo' && styles.abaAtiva]} onPress={() => setAbaAtiva('novo')}>
            <Text style={[styles.abaTexto, abaAtiva === 'novo' && styles.abaTextoAtivo]}>
              {romaneioEditando ? '✏️ Editar Carga' : 'Carregamento'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.abaBotao, abaAtiva === 'remocao' && styles.abaAtiva]} onPress={() => setAbaAtiva('remocao')}>
            <Text style={[styles.abaTexto, abaAtiva === 'remocao' && styles.abaTextoAtivo]}>Remoção</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.abaBotao, abaAtiva === 'relatorio' && styles.abaAtiva]} onPress={() => setAbaAtiva('relatorio')}>
            <Text style={[styles.abaTexto, abaAtiva === 'relatorio' && styles.abaTextoAtivo]}>Relatórios</Text>
          </TouchableOpacity>
        </View>

        {/* ========================================================================= */}
        {/* CONTEÚDO: CARREGAMENTO */}
        {/* ========================================================================= */}
        {abaAtiva === 'novo' && (
          <View style={styles.card}>
            
            {(carregamentosPendentes.length > 0 || remocoesPendentes.length > 0) && (
              <View style={styles.syncCard}>
                <Text style={styles.syncTexto}>📦 {carregamentosPendentes.length + remocoesPendentes.length} pendência(s) aguardando envio</Text>
                <TouchableOpacity style={styles.btnSync} onPress={sincronizarGeralComBanco} disabled={sincronizando}>
                  {sincronizando ? <ActivityIndicator color="#F39C12" size="small" /> : <Text style={styles.btnSyncTexto}>🚀 ENVIAR PARA NUVEM</Text>}
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.formTitle}>1. Cabeçalho do Romaneio</Text>
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Data Saída:</Text>
                <TextInput style={styles.input} value={dataSaida} onChangeText={t => setDataSaida(aplicarMascaraData(t))} placeholder="DD/MM/AAAA" keyboardType="numeric" />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Nº Romaneio:</Text>
                <TextInput style={[styles.input, romaneioEditando ? {backgroundColor: '#EAEDED'} : null]} value={numeroRomaneio} onChangeText={setNumeroRomaneio} placeholder="Ex: 001452" editable={!romaneioEditando} />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Tipo de Carga:</Text>
                <View style={[styles.pickerContainer, { borderColor: tipoCarga === 'Madeira' ? '#8E44AD' : '#E0E6ED' }]}>
                  <Picker 
                    selectedValue={tipoCarga} 
                    onValueChange={(val) => {
                      setTipoCarga(val);
                      setItemVariedade(val === 'Madeira' ? 'Pinus' : 'Elliotti');
                    }} 
                    style={styles.picker}
                  >
                    <Picker.Item label="Goma Resina" value="Goma Resina" />
                    <Picker.Item label="Madeira" value="Madeira" />
                  </Picker>
                </View>
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Operação:</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={tipoOperacao} onValueChange={setTipoOperacao} style={styles.picker}>
                    <Picker.Item label="Compra" value="Compra" />
                    <Picker.Item label="Transferência" value="Transferência" />
                  </Picker>
                </View>
              </View>
            </View>

            <Text style={styles.formTitle}>2. Transporte e Procedência</Text>
            <View style={styles.row}>
              <View style={{width: '65%'}}>
                <Text style={styles.label}>Motorista:</Text>
                <TextInput style={styles.input} value={motorista} onChangeText={setMotorista} placeholder="Nome do motorista" />
              </View>
              <View style={{width: '32%'}}>
                <Text style={styles.label}>Placa:</Text>
                <TextInput style={styles.input} value={placa} onChangeText={setPlaca} placeholder="AAA-0000" autoCapitalize="characters" />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Hora Entrada:</Text>
                <TextInput style={styles.input} value={horaEntrada} onChangeText={t => setHoraEntrada(aplicarMascaraHora(t))} placeholder="HH:MM" keyboardType="numeric" />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Hora Saída:</Text>
                <TextInput style={styles.input} value={horaSaida} onChangeText={t => setHoraSaida(aplicarMascaraHora(t))} placeholder="HH:MM" keyboardType="numeric" />
              </View>
            </View>

            <Text style={styles.label}>Local / Quadra (Anotação Livro):</Text>
            <TextInput style={styles.input} value={localQuadra} onChangeText={setLocalQuadra} placeholder="Referência de local" />

            {tipoCarga === 'Madeira' && (
              <View style={[styles.caixaLotes, { borderColor: '#8E44AD', backgroundColor: '#F9E79F' }]}>
                <Text style={[styles.formTitle, { color: '#8E44AD' }]}>Dimensões da Madeira (m)</Text>
                <View style={styles.row}>
                  <View style={{width: '32%'}}>
                    <Text style={styles.label}>Altura:</Text>
                    <TextInput style={styles.input} value={alturaMedia} onChangeText={setAlturaMedia} keyboardType="numeric" placeholder="0,00" />
                  </View>
                  <View style={{width: '32%'}}>
                    <Text style={styles.label}>Largura:</Text>
                    <TextInput style={styles.input} value={largura} onChangeText={setLargura} keyboardType="numeric" placeholder="0,00" />
                  </View>
                  <View style={{width: '32%'}}>
                    <Text style={styles.label}>Comprim.:</Text>
                    <TextInput style={styles.input} value={comprimento} onChangeText={setComprimento} keyboardType="numeric" placeholder="0,00" />
                  </View>
                </View>
                <View style={styles.caixaMedia}>
                  <Text style={styles.mediaTexto}>Volume Calculado:</Text>
                  <Text style={styles.mediaValor}>{volume || '0,00'} st</Text>
                </View>
              </View>
            )}

            <View style={styles.caixaLotes}>
              <Text style={styles.formTitle}>Adicionar Origem (Fazendas/Lotes)</Text>
              
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>Fazenda:</Text>
                  <View style={styles.pickerContainer}>
                    <Picker selectedValue={itemFazenda} onValueChange={setItemFazenda} style={styles.picker}>
                      <Picker.Item label="..." value="" />
                      {listaFazendas.map((f, i) => <Picker.Item key={i} label={f} value={f} />)}
                    </Picker>
                  </View>
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Variedade:</Text>
                  <View style={styles.pickerContainer}>
                    {tipoCarga === 'Madeira' ? (
                      <Picker selectedValue={itemVariedade} onValueChange={setItemVariedade} style={styles.picker}>
                        <Picker.Item label="Pinus" value="Pinus" />
                        <Picker.Item label="Eucalipto" value="Eucalipto" />
                      </Picker>
                    ) : (
                      <Picker selectedValue={itemVariedade} onValueChange={setItemVariedade} style={styles.picker}>
                        <Picker.Item label="Elliotti" value="Elliotti" />
                        <Picker.Item label="Tropical" value="Tropical" />
                        <Picker.Item label="Híbrido" value="Híbrido" />
                      </Picker>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.row}>
                {tipoCarga !== 'Madeira' && (
                  <View style={{width: '60%'}}>
                    <Text style={styles.label}>Qtd Tambores:</Text>
                    <TextInput style={styles.input} value={itemQuantidade} onChangeText={setItemQuantidade} keyboardType="numeric" placeholder="Ex: 20" />
                  </View>
                )}
                <View style={{width: tipoCarga === 'Madeira' ? '100%' : '35%', justifyContent: 'center', paddingTop: tipoCarga === 'Madeira' ? 0 : 5}}>
                  <TouchableOpacity style={styles.btnAdicionarLote} onPress={adicionarItem}>
                    <Text style={{color: '#FFF', fontWeight: 'bold'}}>➕ Add {tipoCarga === 'Madeira' ? 'Origem/Lote' : ''}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {itensCarga.length > 0 && (
                <View style={styles.listaCarrinho}>
                  <Text style={{fontWeight: 'bold', color: '#2C3E50', marginBottom: 5}}>Itens na Carga:</Text>
                  {itensCarga.map((item) => (
                    <View key={item.id_temp} style={styles.loteItem}>
                      <Text style={{flex: 1, color: '#34495E'}}>
                        📦 {tipoCarga === 'Madeira' ? '' : `${item.quantidade}x `}{item.variedade} ({item.fazenda})
                      </Text>
                      <TouchableOpacity onPress={() => removerItem(item.id_temp)}>
                        <Text style={{color: '#E74C3C', fontWeight: 'bold', padding: 5}}>X</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <Text style={styles.formTitle}>Pesagem Global e Observações</Text>
            
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Peso Bruto (Kg):</Text>
                <TextInput style={styles.input} value={pesoBruto} onChangeText={setPesoBruto} keyboardType="numeric" placeholder="Ex: 15000" />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Tara Caminhão (Kg):</Text>
                <TextInput style={styles.input} value={tara} onChangeText={setTara} keyboardType="numeric" placeholder="Ex: 5000" />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Peso Líq. Calculado:</Text>
                <TextInput style={[styles.input, {backgroundColor: '#EAEDED', fontWeight: 'bold'}]} value={pesoLiquidoTotal} onChangeText={setPesoLiquidoTotal} keyboardType="numeric" />
              </View>
              {tipoCarga === 'Goma Resina' && (
                <View style={styles.col}>
                  <Text style={styles.label}>Média Geral (Kg/Tb):</Text>
                  <TextInput style={[styles.input, {backgroundColor: '#EAEDED', color: '#27AE60', fontWeight: 'bold'}]} value={mediaGeral} editable={false} />
                </View>
              )}
            </View>

            <Text style={styles.label}>Observações (Opcional):</Text>
            <TextInput 
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]} 
              value={observacao} 
              onChangeText={setObservacao} 
              placeholder="Digite alguma observação sobre o romaneio ou a carga..." 
              multiline={true} 
            />

            <TouchableOpacity style={[styles.button, salvando && styles.buttonDisabled]} onPress={salvarCarregamento} disabled={salvando}>
              {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>{romaneioEditando ? '💾 Atualizar Romaneio (Fila)' : '📄 Salvar na Fila e Gerar PDF'}</Text>}
            </TouchableOpacity>

            {romaneioEditando && (
              <TouchableOpacity style={styles.btnCancelarEdicao} onPress={limparFormularioCarregamento}>
                <Text style={styles.btnCancelarTexto}>Cancelar Edição</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* 🟢 CONTEÚDO DA NOVA ABA: REMOÇÃO */}
        {/* ========================================================================= */}
        {abaAtiva === 'remocao' && (
          <View style={[styles.card, { borderColor: '#8E44AD', borderWidth: 2 }]}>
            
            {(carregamentosPendentes.length > 0 || remocoesPendentes.length > 0) && (
              <View style={styles.syncCard}>
                <Text style={styles.syncTexto}>📦 {carregamentosPendentes.length + remocoesPendentes.length} pendência(s) aguardando envio</Text>
                <TouchableOpacity style={styles.btnSync} onPress={sincronizarGeralComBanco} disabled={sincronizando}>
                  {sincronizando ? <ActivityIndicator color="#F39C12" size="small" /> : <Text style={styles.btnSyncTexto}>🚀 ENVIAR PARA NUVEM</Text>}
                </TouchableOpacity>
              </View>
            )}

            <Text style={[styles.formTitle, { color: '#8E44AD' }]}>Registrar Remoção de Tambores</Text>
            <Text style={{ fontSize: 13, color: '#7F8C8D', marginBottom: 15 }}>
              A remoção indica que os tambores foram tirados da floresta (Quadra/Ramal) e levados para o local de estocagem, prontos para o carregamento.
            </Text>

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Data da Remoção:</Text>
                <TextInput style={styles.input} value={dataRemocao} onChangeText={t => setDataRemocao(aplicarMascaraData(t))} placeholder="DD/MM/AAAA" keyboardType="numeric" />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Fazenda:</Text>
                <View style={styles.pickerContainer}>
                  <Picker selectedValue={fazendaRemocao} onValueChange={setFazendaRemocao} style={styles.picker}>
                    <Picker.Item label="..." value="" />
                    {listaFazendas.map((f, i) => <Picker.Item key={i} label={f} value={f} />)}
                  </Picker>
                </View>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Quadra:</Text>
                <TextInput style={styles.input} value={quadraRemocao} onChangeText={setQuadraRemocao} placeholder="Ex: 15, 16" />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Ramal (Opcional):</Text>
                <TextInput style={styles.input} value={ramalRemocao} onChangeText={setRamalRemocao} placeholder="Ex: 2, 3" />
              </View>
            </View>

            <View style={{ marginBottom: 15 }}>
              <Text style={styles.label}>Qtd Tambores:</Text>
              <TextInput style={styles.input} value={qtdRemocao} onChangeText={setQtdRemocao} keyboardType="numeric" placeholder="Ex: 45" />
            </View>

            <Text style={styles.label}>Observações (Opcional):</Text>
            <TextInput 
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]} 
              value={obsRemocao} 
              onChangeText={setObsRemocao} 
              placeholder="Tratorista, dificuldades de acesso, etc..." 
              multiline={true} 
            />

            <TouchableOpacity style={[styles.button, {backgroundColor: '#8E44AD'}, salvando && styles.buttonDisabled]} onPress={salvarRemocao} disabled={salvando}>
              {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>🚜 Salvar Remoção na Fila</Text>}
            </TouchableOpacity>

          </View>
        )}

        {/* ========================================================================= */}
        {/* CONTEÚDO: RELATÓRIO DE SAÍDAS */}
        {/* ========================================================================= */}
        {abaAtiva === 'relatorio' && (
          <View style={styles.card}>
            <Text style={styles.formTitle}>Busca de Romaneios Salvos</Text>
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Data Inicial:</Text>
                <TextInput style={styles.input} value={dataInicio} onChangeText={t => setDataInicio(aplicarMascaraData(t))} placeholder="DD/MM/AAAA" keyboardType="numeric" />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Data Final:</Text>
                <TextInput style={styles.input} value={dataFim} onChangeText={t => setDataFim(aplicarMascaraData(t))} placeholder="DD/MM/AAAA" keyboardType="numeric" />
              </View>
            </View>

            <TouchableOpacity style={styles.btnBuscar} onPress={buscarRelatorio} disabled={buscando}>
              {buscando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>🔍 Buscar Saídas</Text>}
            </TouchableOpacity>

            {listaRelatorioAgrupada.length > 0 && (
              <View style={{marginTop: 20}}>
                <Text style={styles.formTitle}>Romaneios Encontrados ({listaRelatorioAgrupada.length})</Text>
                
                <FlatList
                  data={listaRelatorioAgrupada}
                  keyExtractor={(item) => item.numero_romaneio}
                  initialNumToRender={10}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                  renderItem={({ item }) => (
                     <ItemRelatorioCard 
                        romaneio={item} 
                        isAdmin={isAdmin} 
                        onEditar={editarCarga} 
                     />
                  )}
                  scrollEnabled={false} 
                />

              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', padding: 20 },
  offlineBadge: { backgroundColor: '#E74C3C', padding: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 10, borderRadius: 5 },
  offlineText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  header: { marginBottom: 20, marginTop: 10, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 16, color: '#7F8C8D', marginTop: 5 },
  
  menuAbas: { flexDirection: 'row', backgroundColor: '#E0E6ED', borderRadius: 10, padding: 4, marginBottom: 20 },
  abaBotao: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  abaAtiva: { backgroundColor: '#FFFFFF', elevation: 2 },
  abaTexto: { fontWeight: 'bold', color: '#7F8C8D', fontSize: 12 },
  abaTextoAtivo: { color: '#2980B9' },
  
  card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 15, elevation: 5 },
  formTitle: { fontSize: 16, fontWeight: 'bold', color: '#2980B9', marginBottom: 15, marginTop: 10, borderBottomWidth: 1, borderBottomColor: '#ECF0F1', paddingBottom: 5 },
  label: { fontSize: 13, fontWeight: '700', color: '#34495E', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: '#F8FAFC', marginBottom: 15 },
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', overflow: 'hidden', marginBottom: 15 },
  picker: { height: 50, width: '100%' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { width: '48%' },
  caixaLotes: { backgroundColor: '#F4FDFC', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#AED6F1', marginBottom: 20 },
  btnAdicionarLote: { backgroundColor: '#3498DB', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 15 },
  listaCarrinho: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#AED6F1', paddingTop: 10 },
  loteItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', padding: 8, borderRadius: 5, marginBottom: 5, borderWidth: 1, borderColor: '#E0E6ED' },
  caixaMedia: { backgroundColor: '#E8F8F5', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 5, marginTop: 5, borderWidth: 1, borderColor: '#27AE60' },
  mediaTexto: { fontSize: 14, color: '#1E8449', fontWeight: 'bold' },
  mediaValor: { fontSize: 22, color: '#1E8449', fontWeight: '900' },
  button: { backgroundColor: '#27AE60', padding: 15, borderRadius: 8, alignItems: 'center' },
  btnCancelarEdicao: { backgroundColor: '#E74C3C', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  btnCancelarTexto: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  btnBuscar: { backgroundColor: '#34495E', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  btnGerarPdf: { backgroundColor: '#E67E22', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  syncCard: { backgroundColor: '#F39C12', padding: 15, borderRadius: 12, marginBottom: 20, alignItems: 'center' },
  syncTexto: { color: '#FFF', fontWeight: 'bold', marginBottom: 10 },
  btnSync: { backgroundColor: '#FFF', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8, alignItems: 'center', width: '100%' },
  btnSyncTexto: { color: '#F39C12', fontWeight: 'bold', fontSize: 12 },
  itemRelatorio: { flexDirection: 'row', backgroundColor: '#FFF', padding: 15, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#BDC3C7', alignItems: 'center', elevation: 2 },
  lotesResumo: { backgroundColor: '#F8FAFC', padding: 5, borderRadius: 5, marginVertical: 5 },
  btnEditarPequeno: { backgroundColor: '#F39C12', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8, marginLeft: 10, width: 80, justifyContent: 'center' }
});