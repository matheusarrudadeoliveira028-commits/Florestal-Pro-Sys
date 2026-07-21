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
  const mediaCalculada = romaneio.totalPeso > 0 ? (romaneio.totalPeso / romaneio.totalQtd).toFixed(2).replace('.', ',') : '-';
  
  return (
    <View style={styles.itemRelatorio}>
      <View style={{flex: 1}}>
        <Text style={{fontWeight: 'bold', color: '#2C3E50', fontSize: 15}}>Romaneio: {romaneio.numero_romaneio}</Text>
        <Text style={{fontSize: 12, color: '#7F8C8D', marginBottom: 5}}>Data: {romaneio.data_saida.split('-').reverse().join('/')}</Text>
        
        <View style={styles.lotesResumo}>
          {romaneio.itens.map((i: any, index: number) => (
            <Text key={index} style={{fontSize: 11, color: '#34495E'}}>• {i.quantidade}x {i.variedade} ({i.fazenda})</Text>
          ))}
        </View>

        <Text style={{fontSize: 13, color: romaneio.totalPeso > 0 ? '#27AE60' : '#E67E22', fontWeight: 'bold', marginTop: 5}}>
          Total: {romaneio.totalQtd} Tb | Peso: {romaneio.totalPeso > 0 ? `${romaneio.totalPeso.toFixed(2).replace('.', ',')} Kg` : 'Pendente'}
        </Text>
        {romaneio.totalPeso > 0 && <Text style={{fontSize: 11, color: '#27AE60'}}>Média: {mediaCalculada} Kg/Tb</Text>}
      </View>
      
      {isAdmin && (
        <TouchableOpacity style={styles.btnEditarPequeno} onPress={() => onEditar(romaneio)}>
          <Text style={{color: '#FFF', fontSize: 13, fontWeight: 'bold', textAlign: 'center'}}>✏️ Pesar / Editar</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// =========================================================================
// TELA PRINCIPAL
// =========================================================================
export default function CarregamentosScreen() {
  const [abaAtiva, setAbaAtiva] = useState<'novo' | 'relatorio'>('novo');

  const [isAdmin, setIsAdmin] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [carregamentosPendentes, setCarregamentosPendentes] = useState<any[]>([]);
  const [sincronizando, setSincronizando] = useState(false);

  const [romaneioEditando, setRomaneioEditando] = useState<string | null>(null);
  const [dataSaida, setDataSaida] = useState('');
  const [numeroRomaneio, setNumeroRomaneio] = useState('');
  const [procedenciaTipo, setProcedenciaTipo] = useState('Produção Própria');
  const [procedenciaNome, setProcedenciaNome] = useState('');
  const [pesoLiquidoTotal, setPesoLiquidoTotal] = useState('');
  const [mediaGeral, setMediaGeral] = useState('0,00');
  
  // 👉 NOVO ESTADO: Observação
  const [observacao, setObservacao] = useState('');

  const [itemFazenda, setItemFazenda] = useState('');
  const [itemVariedade, setItemVariedade] = useState('Elliotti');
  const [itemQuantidade, setItemQuantidade] = useState('');
  
  const [itensCarga, setItensCarga] = useState<any[]>([]);
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
    
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    setDataInicio(primeiroDia.toLocaleDateString('pt-BR'));
    setDataFim(ultimoDia.toLocaleDateString('pt-BR'));
  }, []);

  const totalTamboresCarga = itensCarga.reduce((acc, curr) => acc + parseInt(curr.quantidade || '0'), 0);

  useEffect(() => {
    const pesoNum = parseFloat(pesoLiquidoTotal.replace(',', '.')) || 0;
    if (totalTamboresCarga > 0 && pesoNum > 0) {
      const media = pesoNum / totalTamboresCarga;
      setMediaGeral(media.toFixed(2).replace('.', ','));
    } else {
      setMediaGeral('0,00');
    }
  }, [itensCarga, pesoLiquidoTotal]);

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
      const dados = await AsyncStorage.getItem('@carregamentos_off');
      if (dados) setCarregamentosPendentes(JSON.parse(dados));
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

  const converterDataBanco = (dataBR: string) => {
    const p = dataBR.split('/');
    if (p.length === 3) return `${p[2]}-${p[1]}-${p[0]}`;
    return null;
  };

  const adicionarItem = () => {
    if (!itemFazenda || !itemQuantidade) {
      return Alert.alert("Aviso", "Selecione a Fazenda e a Quantidade do lote!");
    }
    
    setItensCarga([...itensCarga, { 
      id_temp: Date.now().toString(),
      fazenda: itemFazenda, 
      variedade: itemVariedade, 
      quantidade: itemQuantidade 
    }]);

    setItemFazenda('');
    setItemQuantidade('');
  };

  const removerItem = (idTemp: string) => {
    setItensCarga(itensCarga.filter(i => i.id_temp !== idTemp));
  };

  const salvarCarregamento = async () => {
    if (!dataSaida || !numeroRomaneio) return Alert.alert("Aviso", "Preencha a Data e o Nº do Romaneio!");
    if (itensCarga.length === 0) return Alert.alert("Aviso", "Adicione pelo menos um lote na carga!");

    const dataBd = converterDataBanco(dataSaida);
    if (!dataBd) return Alert.alert("Aviso", "Data inválida.");

    if (romaneioEditando && isOffline) {
      return Alert.alert("Aviso Offline", "Não é possível editar/pesar um romaneio existente enquanto estiver sem internet.");
    }

    setSalvando(true);

    const pesoNum = pesoLiquidoTotal ? parseFloat(pesoLiquidoTotal.replace(',', '.')) : 0;
    const mediaCalculada = pesoNum > 0 && totalTamboresCarga > 0 ? pesoNum / totalTamboresCarga : null;

    const payloadMultiplo = itensCarga.map(item => {
      const qtdLote = parseInt(item.quantidade);
      return {
        data_saida: dataBd,
        numero_romaneio: numeroRomaneio,
        procedencia_tipo: procedenciaTipo,
        procedencia_nome: procedenciaTipo === 'Parceiro Extrator' ? procedenciaNome : null,
        fazenda: item.fazenda,
        variedade: item.variedade,
        quantidade: qtdLote,
        peso_liquido: mediaCalculada ? mediaCalculada * qtdLote : null,
        media_tambor: mediaCalculada,
        observacao: observacao // 👉 Inserindo no Banco
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
          { text: "Ver PDF", onPress: () => gerarPdfRomaneio(payloadMultiplo) },
          { text: "OK", style: "cancel" }
        ]
      );
      
      limparFormulario();
    } catch (error) {
      Alert.alert("Erro", "Falha ao salvar carregamento no celular.");
    } finally {
      setSalvando(false);
    }
  };

  const sincronizarComBanco = async () => {
    if (carregamentosPendentes.length === 0) return;
    setSincronizando(true);

    try {
      for (const item of carregamentosPendentes) {
        if (item.isEdit && item.romaneioOriginal) {
          await supabase.from('carregamentos').delete().eq('numero_romaneio', item.romaneioOriginal);
        }
        const { error } = await supabase.from('carregamentos').insert(item.payload);
        if (error) throw new Error(error.message);
      }
      
      await AsyncStorage.removeItem('@carregamentos_off');
      setCarregamentosPendentes([]);
      Alert.alert("🚀 Sucesso!", "Todos os romaneios foram enviados para a nuvem.");
      
      if (abaAtiva === 'relatorio') buscarRelatorio();

    } catch (e: any) {
      Alert.alert("Erro na Sincronização", "A internet falhou: " + e.message);
    } finally {
      setSincronizando(false);
    }
  };

  const limparFormulario = () => {
    setRomaneioEditando(null);
    setNumeroRomaneio(''); 
    setProcedenciaNome('');
    setItensCarga([]);
    setPesoLiquidoTotal('');
    setObservacao(''); 
  };

  const editarCarga = useCallback((romaneioAgrupado: any) => {
    setRomaneioEditando(romaneioAgrupado.numero_romaneio);
    setDataSaida(romaneioAgrupado.data_saida.split('-').reverse().join('/'));
    setNumeroRomaneio(romaneioAgrupado.numero_romaneio);
    setProcedenciaTipo(romaneioAgrupado.procedencia_tipo);
    setProcedenciaNome(romaneioAgrupado.procedencia_nome || '');
    setObservacao(romaneioAgrupado.observacao || ''); 
    
    const carrinhoRecriado = romaneioAgrupado.itens.map((i: any, index: number) => ({
      id_temp: index.toString(),
      fazenda: i.fazenda,
      variedade: i.variedade,
      quantidade: i.quantidade.toString()
    }));
    
    setItensCarga(carrinhoRecriado);
    setPesoLiquidoTotal(romaneioAgrupado.totalPeso > 0 ? romaneioAgrupado.totalPeso.toFixed(2).replace('.', ',') : '');
    
    setAbaAtiva('novo');
  }, []);

  const gerarPdfRomaneio = async (linhas: any[]) => {
    if (linhas.length === 0) return;
    setGerandoPDF(true);

    const base = linhas[0];
    const procNome = base.procedencia_nome ? ` - ${base.procedencia_nome}` : '';
    
    const pesoTotalCalc = linhas.reduce((acc, curr) => acc + (curr.peso_liquido || 0), 0);
    const qtdTotalCalc = linhas.reduce((acc, curr) => acc + (curr.quantidade || 0), 0);
    const mediaFinal = pesoTotalCalc > 0 ? pesoTotalCalc / qtdTotalCalc : 0;

    const pesoFormt = pesoTotalCalc > 0 ? `${pesoTotalCalc.toFixed(2).replace('.', ',')} Kg` : 'A Pesalhar';
    const mediaFormt = mediaFinal > 0 ? `${mediaFinal.toFixed(2).replace('.', ',')} Kg/Tb` : '-';

    let linhasTabelaHtml = '';
    linhas.forEach(l => {
      linhasTabelaHtml += `<tr><td>${l.fazenda}</td><td>${l.variedade}</td><td>${l.quantidade} Tb</td></tr>`;
    });

    // 👉 BLOCO HTML DA OBSERVAÇÃO PARA O PDF INDIVIDUAL
    const blocoObservacao = base.observacao ? `
      <div class="box" style="margin-top: 10px;">
        <span class="label">Observações da Carga:</span><br>
        <span class="value" style="font-size: 14px; font-weight: normal;">${base.observacao}</span>
      </div>
    ` : '';

    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
            h1 { text-align: center; color: #2C3E50; border-bottom: 2px solid #27AE60; padding-bottom: 10px; }
            .box { border: 1px solid #BDC3C7; padding: 15px; border-radius: 8px; margin-top: 20px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .label { font-weight: bold; color: #7F8C8D; font-size: 14px; }
            .value { font-size: 16px; color: #2C3E50; font-weight: bold; }
            .highlight { color: #E67E22; font-size: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #BDC3C7; padding: 8px; text-align: center; }
            th { background-color: #ECF0F1; }
            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #95A5A6; }
            .signature { margin-top: 80px; text-align: center; }
            .signature hr { width: 300px; border: 1px solid #333; }
          </style>
        </head>
        <body>
          <h1>NOTA DE ROMANEIO (SAÍDA)</h1>
          <div class="box">
            <div class="row">
              <div><span class="label">Nº Romaneio:</span><br><span class="value highlight">${base.numero_romaneio}</span></div>
              <div style="text-align: right;"><span class="label">Data de Saída:</span><br><span class="value">${dataSaida}</span></div>
            </div>
            <div class="row">
              <div><span class="label">Procedência:</span><br><span class="value">${base.procedencia_tipo}${procNome}</span></div>
              <div style="text-align: right;"><span class="label">Total Geral:</span><br><span class="value">${qtdTotalCalc} Tambores</span></div>
            </div>
          </div>

          <h3 style="color: #2980B9; margin-top: 25px;">Lotes da Carga</h3>
          <table>
            <tr><th>Fazenda</th><th>Variedade</th><th>Quantidade</th></tr>
            ${linhasTabelaHtml}
          </table>

          <div class="box" style="background-color: #F8FAFC;">
            <h3 style="margin-top: 0; color: #2980B9;">Pesagem Oficial</h3>
            <div class="row" style="margin-bottom: 0;">
              <div><span class="label">Peso Líquido Total:</span><br><span class="value" style="font-size: 22px;">${pesoFormt}</span></div>
              <div style="text-align: right;"><span class="label">Média por Tambor:</span><br><span class="value" style="font-size: 22px;">${mediaFormt}</span></div>
            </div>
          </div>

          ${blocoObservacao}

          <div class="signature"><hr><p><strong>Assinatura do Responsável (Expedição)</strong></p></div>
          <div class="footer">Documento gerado automaticamente pelo Sistema Resinas Abud.</div>
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
            numero_romaneio: curr.numero_romaneio,
            data_saida: curr.data_saida,
            procedencia_tipo: curr.procedencia_tipo,
            procedencia_nome: curr.procedencia_nome,
            observacao: curr.observacao, 
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

  // 👉 NOVO GERADOR DE PDF DO RELATÓRIO
  const gerarPdfRelatorio = async () => {
    if (listaRelatorioAgrupada.length === 0) return Alert.alert("Aviso", "Faça uma busca primeiro.");
    setGerandoPDF(true);

    const totalTambores = listaRelatorioAgrupada.reduce((acc, curr) => acc + curr.totalQtd, 0);
    const totalPeso = listaRelatorioAgrupada.reduce((acc, curr) => acc + curr.totalPeso, 0);
    const mediaGeral = totalTambores > 0 ? (totalPeso / totalTambores).toFixed(2).replace('.', ',') : '0,00';

    let linhasTabela = '';
    listaRelatorioAgrupada.forEach(romaneio => {
      const dataBr = romaneio.data_saida.split('-').reverse().join('/');
      const pesoFmt = romaneio.totalPeso > 0 ? romaneio.totalPeso.toFixed(2).replace('.', ',') : '-';
      const mediaCalculada = romaneio.totalPeso > 0 ? (romaneio.totalPeso / romaneio.totalQtd).toFixed(2).replace('.', ',') : '-';
      
      let detalhesLotes = romaneio.itens.map((i: any) => `${i.fazenda}(${i.variedade.substring(0,4)}): ${i.quantidade}tb`).join('<br>');
      
      linhasTabela += `
        <tr>
          <td>${dataBr}</td>
          <td><strong>${romaneio.numero_romaneio}</strong></td>
          <td style="font-size: 10px; text-align: left;">${detalhesLotes}</td>
          <td>${romaneio.totalQtd}</td>
          <td>${pesoFmt}</td>
          <td>${mediaCalculada}</td>
        </tr>
      `;

      // 👉 AQUI A OBSERVAÇÃO É INSERIDA SE EXISTIR
      if (romaneio.observacao) {
        linhasTabela += `
          <tr>
            <td colspan="6" style="text-align: left; font-size: 11px; color: #555; background-color: #F8FAFC; border-top: none; font-style: italic;">
              <strong style="color: #2980B9;">📝 Obs:</strong> ${romaneio.observacao}
            </td>
          </tr>
        `;
      }
    });

    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 10px; font-size: 12px; }
            h2 { text-align: center; color: #2C3E50; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #BDC3C7; padding: 6px; text-align: center; }
            th { background-color: #ECF0F1; color: #2C3E50; }
            .resumo { display: flex; justify-content: space-around; background: #E8F8F5; padding: 15px; border: 1px solid #27AE60; border-radius: 8px; margin-top: 20px; font-size: 14px; }
          </style>
        </head>
        <body>
          <h2>RELATÓRIO DE EXPEDIÇÃO (POR ROMANEIO)</h2>
          <p style="text-align: center;">Período: ${dataInicio} a ${dataFim}</p>
          
          <table>
            <tr>
              <th style="width: 12%">Data</th>
              <th style="width: 15%">Romaneio</th>
              <th style="width: 35%">Lotes da Carga</th>
              <th style="width: 10%">Qtd(Tb)</th>
              <th style="width: 15%">Peso Liq(Kg)</th>
              <th style="width: 13%">Média(Kg)</th>
            </tr>
            ${linhasTabela}
          </table>

          <div class="resumo">
            <div><strong>Total de Tambores:</strong> ${totalTambores}</div>
            <div><strong>Peso Líquido Total:</strong> ${totalPeso.toFixed(2).replace('.', ',')} Kg</div>
            <div><strong>Média Geral:</strong> ${mediaGeral} Kg/Tb</div>
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 50 }} keyboardShouldPersistTaps="handled">
        
        {isOffline && (
          <View style={styles.offlineBadge}>
            <Text style={styles.offlineText}>⚠️ MODO OFFLINE ATIVADO - Lançamentos salvos no celular.</Text>
          </View>
        )}

        <View style={styles.header}>
          <Text style={styles.title}>Expedição 🚛</Text>
          <Text style={styles.subtitle}>Gestão de Cargas Múltiplas</Text>
        </View>

        <View style={styles.menuAbas}>
          <TouchableOpacity style={[styles.abaBotao, abaAtiva === 'novo' && styles.abaAtiva]} onPress={() => setAbaAtiva('novo')}>
            <Text style={[styles.abaTexto, abaAtiva === 'novo' && styles.abaTextoAtivo]}>
              {romaneioEditando ? '✏️ Editando Carga' : 'Novo Carregamento'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.abaBotao, abaAtiva === 'relatorio' && styles.abaAtiva]} onPress={() => setAbaAtiva('relatorio')}>
            <Text style={[styles.abaTexto, abaAtiva === 'relatorio' && styles.abaTextoAtivo]}>Relatório de Saídas</Text>
          </TouchableOpacity>
        </View>

        {abaAtiva === 'novo' && (
          <View style={styles.card}>
            
            {carregamentosPendentes.length > 0 && (
              <View style={styles.syncCard}>
                <Text style={styles.syncTexto}>📦 {carregamentosPendentes.length} romaneio(s) aguardando envio</Text>
                <TouchableOpacity style={styles.btnSync} onPress={sincronizarComBanco} disabled={sincronizando}>
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

            <Text style={styles.label}>Procedência Geral:</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={procedenciaTipo} onValueChange={setProcedenciaTipo} style={styles.picker}>
                <Picker.Item label="Produção Própria" value="Produção Própria" />
                <Picker.Item label="Parceiro Extrator Especificado" value="Parceiro Extrator" />
              </Picker>
            </View>
            {procedenciaTipo === 'Parceiro Extrator' && (
              <View style={{marginBottom: 10}}>
                <TextInput style={styles.input} value={procedenciaNome} onChangeText={setProcedenciaNome} placeholder="Nome do Parceiro" />
              </View>
            )}

            <View style={styles.caixaLotes}>
              <Text style={styles.formTitle}>2. Adicionar Lotes à Carga</Text>
              
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
                    <Picker selectedValue={itemVariedade} onValueChange={setItemVariedade} style={styles.picker}>
                      <Picker.Item label="Elliotti" value="Elliotti" />
                      <Picker.Item label="Tropical" value="Tropical" />
                      <Picker.Item label="Híbrido" value="Híbrido" />
                    </Picker>
                  </View>
                </View>
              </View>

              <View style={styles.row}>
                <View style={{width: '60%'}}>
                  <Text style={styles.label}>Qtd Tambores:</Text>
                  <TextInput style={styles.input} value={itemQuantidade} onChangeText={setItemQuantidade} keyboardType="numeric" placeholder="Ex: 20" />
                </View>
                <View style={{width: '35%', justifyContent: 'center', paddingTop: 5}}>
                  <TouchableOpacity style={styles.btnAdicionarLote} onPress={adicionarItem}>
                    <Text style={{color: '#FFF', fontWeight: 'bold'}}>➕ Add</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {itensCarga.length > 0 && (
                <View style={styles.listaCarrinho}>
                  <Text style={{fontWeight: 'bold', color: '#2C3E50', marginBottom: 5}}>Itens na Carga:</Text>
                  {itensCarga.map((item) => (
                    <View key={item.id_temp} style={styles.loteItem}>
                      <Text style={{flex: 1, color: '#34495E'}}>📦 {item.quantidade}x {item.variedade} ({item.fazenda})</Text>
                      <TouchableOpacity onPress={() => removerItem(item.id_temp)}>
                        <Text style={{color: '#E74C3C', fontWeight: 'bold', padding: 5}}>X</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <Text style={styles.formTitle}>3. Totais, Pesagem e Observações</Text>
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Total de Tambores:</Text>
                <TextInput style={[styles.input, {backgroundColor: '#EAEDED', fontWeight: 'bold'}]} value={totalTamboresCarga.toString()} editable={false} />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Peso Líq. Total (Kg):</Text>
                <TextInput style={styles.input} value={pesoLiquidoTotal} onChangeText={setPesoLiquidoTotal} keyboardType="numeric" placeholder="Opcional agora" />
              </View>
            </View>

            {/* 👉 CAMPO DE OBSERVAÇÃO */}
            <Text style={styles.label}>Observações (Opcional):</Text>
            <TextInput 
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]} 
              value={observacao} 
              onChangeText={setObservacao} 
              placeholder="Digite alguma observação sobre o romaneio ou a carga..." 
              multiline={true} 
            />

            <View style={styles.caixaMedia}>
              <Text style={styles.mediaTexto}>Média Geral da Carga:</Text>
              <Text style={styles.mediaValor}>{mediaGeral} Kg/Tb</Text>
            </View>

            <TouchableOpacity style={[styles.button, salvando && styles.buttonDisabled]} onPress={salvarCarregamento} disabled={salvando}>
              {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>{romaneioEditando ? '💾 Atualizar Romaneio (Fila)' : '📄 Salvar na Fila e Gerar PDF'}</Text>}
            </TouchableOpacity>

            {romaneioEditando && (
              <TouchableOpacity style={styles.btnCancelarEdicao} onPress={limparFormulario}>
                <Text style={styles.btnCancelarTexto}>Cancelar Edição</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {abaAtiva === 'relatorio' && (
          <View style={styles.card}>
            <Text style={styles.formTitle}>Filtro de Relatório</Text>
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

                <TouchableOpacity style={styles.btnGerarPdf} onPress={gerarPdfRelatorio} disabled={gerandoPDF}>
                  {gerandoPDF ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>🖨️ Gerar Relatório (PDF)</Text>}
                </TouchableOpacity>
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
  abaTexto: { fontWeight: 'bold', color: '#7F8C8D' },
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
  caixaMedia: { backgroundColor: '#E8F8F5', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#27AE60' },
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