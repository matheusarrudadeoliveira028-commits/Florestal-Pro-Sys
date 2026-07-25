import { Picker } from '@react-native-picker/picker';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

export default function RelatorioFinanceiroScreen() {
  const [fiscalSelecionado, setFiscalSelecionado] = useState('TODOS'); 
  const [listaFiscais, setListaFiscais] = useState<{id: string, nome: string}[]>([]);
  
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  
  const [carregando, setCarregando] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  // Estados de Dados Financeiros
  const [totalGeral, setTotalGeral] = useState(0);
  const [resumoServicos, setResumoServicos] = useState<{servico: string, total: number}[]>([]);
  const [resumoFuncionarios, setResumoFuncionarios] = useState<{colaborador: string, total: number, servicosFeitos: string}[]>([]);

  useEffect(() => {
    // Inicializa na quinzena atual baseada no dia de hoje
    definirQuinzenaAtual();
    carregarFiscais();
  }, []);

  useEffect(() => {
    if (dataInicial.length === 10 && dataFinal.length === 10) {
      buscarDadosFinanceiros();
    }
  }, [dataInicial, dataFinal, fiscalSelecionado]);

  const definirQuinzenaAtual = () => {
    const hoje = new Date();
    const dia = hoje.getDate();
    if (dia <= 15) {
      setQuinzena(1);
    } else {
      setQuinzena(2);
    }
  };

  const setQuinzena = (quinzena: 1 | 2) => {
    const hoje = new Date();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const ano = hoje.getFullYear();
    
    if (quinzena === 1) {
      setDataInicial(`01/${mes}/${ano}`);
      setDataFinal(`15/${mes}/${ano}`);
    } else {
      // Pega o último dia do mês atual
      const ultimoDia = new Date(ano, hoje.getMonth() + 1, 0).getDate();
      setDataInicial(`16/${mes}/${ano}`);
      setDataFinal(`${ultimoDia}/${mes}/${ano}`);
    }
  };

  const aplicarMascaraData = (texto: string, setFunction: React.Dispatch<React.SetStateAction<string>>) => {
    let v = texto.replace(/\D/g, ''); 
    if (v.length > 8) v = v.substring(0, 8); 
    if (v.length > 4) v = v.replace(/^(\d{2})(\d{2})(\d+)/, '$1/$2/$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d+)/, '$1/$2');
    setFunction(v);
  };

  const converterDataParaBanco = (dataBR: string) => {
    const partes = dataBR.split('/');
    if (partes.length === 3) return `${partes[2]}-${partes[1]}-${partes[0]}`;
    return null;
  };

  const carregarFiscais = async () => {
    const { data } = await supabase.from('colaboradores').select('fiscal_id, fiscal_vinculado').limit(5000);
    if (data) {
      const mapa = new Map();
      data.forEach(item => {
        if (item.fiscal_id && item.fiscal_vinculado) {
          mapa.set(item.fiscal_id, item.fiscal_vinculado);
        }
      });
      const unicos = Array.from(mapa, ([id, nome]) => ({ id, nome }));
      unicos.sort((a, b) => a.nome.localeCompare(b.nome));
      setListaFiscais(unicos);
    }
  };

  const buscarDadosFinanceiros = async () => {
    const dataIniBD = converterDataParaBanco(dataInicial);
    const dataFimBD = converterDataParaBanco(dataFinal);
    
    if (!dataIniBD || !dataFimBD) return;

    setCarregando(true);
    try {
      // Pega o nome exato do fiscal para filtrar na tabela diarios_campo
      let fiscalNome = '';
      if (fiscalSelecionado !== 'TODOS') {
        const fObj = listaFiscais.find(f => f.id === fiscalSelecionado);
        if (fObj) fiscalNome = fObj.nome;
      }

      let query = supabase
        .from('diarios_campo')
        .select('colaborador, servico, valor_total')
        .gte('data', `${dataIniBD} 00:00:00`)
        .lte('data', `${dataFimBD} 23:59:59`);

      if (fiscalSelecionado !== 'TODOS') {
        query = query.eq('fiscal_nome', fiscalNome);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        let somaGlobal = 0;
        const mapServicos: Record<string, number> = {};
        const mapFuncionarios: Record<string, { total: number, servicos: Set<string> }> = {};

        data.forEach(item => {
          const valor = Number(item.valor_total) || 0;
          const servico = (item.servico || 'Não Informado').toUpperCase();
          const colaborador = (item.colaborador || 'Não Identificado').toUpperCase();

          somaGlobal += valor;

          // Agrupamento por Serviço
          if (!mapServicos[servico]) mapServicos[servico] = 0;
          mapServicos[servico] += valor;

          // Agrupamento por Funcionário
          if (!mapFuncionarios[colaborador]) {
            mapFuncionarios[colaborador] = { total: 0, servicos: new Set() };
          }
          mapFuncionarios[colaborador].total += valor;
          mapFuncionarios[colaborador].servicos.add(servico);
        });

        // Converte os mapas para Arrays e ordena do maior para o menor valor
        const arrayServicos = Object.keys(mapServicos).map(srv => ({
          servico: srv,
          total: mapServicos[srv]
        })).sort((a, b) => b.total - a.total);

        const arrayFuncionarios = Object.keys(mapFuncionarios).map(colab => ({
          colaborador: colab,
          total: mapFuncionarios[colab].total,
          servicosFeitos: Array.from(mapFuncionarios[colab].servicos).join(', ')
        })).sort((a, b) => b.total - a.total);

        setTotalGeral(somaGlobal);
        setResumoServicos(arrayServicos);
        setResumoFuncionarios(arrayFuncionarios);

      } else {
        setTotalGeral(0);
        setResumoServicos([]);
        setResumoFuncionarios([]);
      }
    } catch (err: any) {
      Alert.alert('Erro', 'Não foi possível carregar os dados financeiros.');
    } finally {
      setCarregando(false);
    }
  };

  const gerarPDF = async () => {
    if (resumoFuncionarios.length === 0) {
      return Alert.alert('Aviso', 'Não há dados financeiros para gerar o PDF neste período.');
    }
    setGerandoPdf(true);

    let nomeDaEquipePdf = 'Todas as Equipes';
    if (fiscalSelecionado !== 'TODOS') {
      const fObj = listaFiscais.find(f => f.id === fiscalSelecionado);
      if (fObj) nomeDaEquipePdf = fObj.nome;
    }

    try {
      let base64Logo = '';
      try {
        const asset = Asset.fromModule(require('../../assets/images/logo.png'));
        await asset.downloadAsync();
        if (Platform.OS === 'web') {
          base64Logo = asset.uri;
        } else {
          let uriDaImagem = asset.localUri || asset.uri;
          if (uriDaImagem.startsWith('http')) {
            const { uri } = await FileSystem.downloadAsync(uriDaImagem, FileSystem.cacheDirectory + 'logo_temp.png');
            uriDaImagem = uri;
          }
          const base64 = await FileSystem.readAsStringAsync(uriDaImagem, { encoding: FileSystem.EncodingType.Base64 });
          base64Logo = `data:image/png;base64,${base64}`;
        }
      } catch (e) {}

      // 1. Montar Tabela de Serviços
      let linhasServicos = '';
      resumoServicos.forEach(srv => {
        linhasServicos += `
          <tr>
            <td style="text-align: left; font-weight: bold; color: #34495E;">${srv.servico}</td>
            <td style="text-align: right; color: #E67E22; font-weight: bold;">R$ ${srv.total.toFixed(2).replace('.', ',')}</td>
          </tr>
        `;
      });

      // 2. Montar Tabela de Funcionários
      let linhasFuncionarios = '';
      resumoFuncionarios.forEach(func => {
        linhasFuncionarios += `
          <tr>
            <td style="text-align: left; font-weight: bold;">${func.colaborador}</td>
            <td style="text-align: left; font-size: 9px; color: #7F8C8D;">${func.servicosFeitos}</td>
            <td style="text-align: right; color: #27AE60; font-weight: bold; font-size: 14px;">R$ ${func.total.toFixed(2).replace('.', ',')}</td>
          </tr>
        `;
      });

      const htmlCompleto = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Relatório Financeiro de Fechamento</title>
            <style>
              @page { margin: 15mm; size: A4 portrait; }
              body { font-family: 'Arial', sans-serif; font-size: 11px; color: #333; margin: 0; padding: 0; }
              .header-container { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #2C3E50; padding-bottom: 15px; }
              .header-logo img { max-height: 50px; }
              h1 { margin: 0; font-size: 18px; color: #2C3E50; text-transform: uppercase; }
              
              .resumo-global { display: flex; justify-content: space-between; align-items: center; background-color: #2C3E50; color: white; padding: 15px 20px; border-radius: 8px; margin-bottom: 25px; }
              .resumo-global-titulo { font-size: 12px; color: #BDC3C7; text-transform: uppercase; margin-bottom: 4px; }
              .resumo-global-valor { font-size: 24px; font-weight: bold; color: #2ECC71; }
              
              .section-title { font-size: 14px; color: #2980B9; border-bottom: 1px solid #BDC3C7; padding-bottom: 5px; margin-bottom: 10px; margin-top: 20px; text-transform: uppercase; }
              
              table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
              th, td { border: 1px solid #BDC3C7; padding: 8px; text-align: center; }
              th { background-color: #ECF0F1; color: #2C3E50; font-size: 10px; text-transform: uppercase; }
              tr:nth-child(even) { background-color: #FDFEFE; }
              tr:nth-child(odd) { background-color: #F4F6F6; }
            </style>
          </head>
          <body>
            <div class="header-container">
              ${base64Logo ? `<div class="header-logo"><img src="${base64Logo}" /></div>` : ''}
              <div style="text-align: right;">
                <h1>Fechamento Financeiro</h1>
                <p style="margin: 4px 0 0 0;">Período: <strong>${dataInicial} a ${dataFinal}</strong></p>
                <p style="margin: 4px 0 0 0;">Equipe: <strong style="text-transform: uppercase;">${nomeDaEquipePdf}</strong></p>
              </div>
            </div>

            <div class="resumo-global">
              <div>
                <div class="resumo-global-titulo">Total da Folha no Período</div>
                <div class="resumo-global-valor">R$ ${totalGeral.toFixed(2).replace('.', ',')}</div>
              </div>
              <div style="text-align: right;">
                <div class="resumo-global-titulo">Colaboradores</div>
                <div style="font-size: 18px; font-weight: bold; color: #F1C40F;">${resumoFuncionarios.length} ativos</div>
              </div>
            </div>

            <div class="section-title">📊 Resumo de Custos por Tipo de Serviço</div>
            <table>
              <thead>
                <tr>
                  <th style="width: 70%; text-align: left;">Serviço Executado</th>
                  <th style="width: 30%; text-align: right;">Custo Total Pago (R$)</th>
                </tr>
              </thead>
              <tbody>
                ${linhasServicos}
              </tbody>
            </table>

            <div style="page-break-before: auto;"></div>

            <div class="section-title">👤 Resumo de Pagamentos por Funcionário</div>
            <table>
              <thead>
                <tr>
                  <th style="width: 40%; text-align: left;">Colaborador</th>
                  <th style="width: 40%; text-align: left;">Serviços Realizados na Quinzena</th>
                  <th style="width: 20%; text-align: right;">Total a Receber (R$)</th>
                </tr>
              </thead>
              <tbody>
                ${linhasFuncionarios}
              </tbody>
            </table>

          </body>
        </html>
      `;

      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute'; iframe.style.width = '0px'; iframe.style.height = '0px'; iframe.style.border = 'none';
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (doc) { doc.open(); doc.write(htmlCompleto); doc.close(); }
        setTimeout(() => {
          if (iframe.contentWindow) { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
          setTimeout(() => document.body.removeChild(iframe), 1000);
        }, 500);
      } else {
        const { uri } = await Print.printToFileAsync({ html: htmlCompleto });
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      }
    } catch (err) {
      Alert.alert('Erro', 'Ocorreu um erro ao gerar o PDF financeiro.');
    } finally {
      setGerandoPdf(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Fechamento Financeiro 💰</Text>
        <Text style={styles.subtitle}>Relatório de pagamentos por equipe e quinzena</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        <View style={styles.cardFiltros}>
          
          <View style={styles.row}>
            <View style={[styles.col, { flex: 1.5, marginRight: 10 }]}>
              <Text style={styles.label}>Equipe (Fiscal):</Text>
              <View style={styles.pickerContainer}>
                <Picker 
                  selectedValue={fiscalSelecionado} 
                  onValueChange={setFiscalSelecionado} 
                  style={styles.picker}
                >
                  <Picker.Item label="Todas as Equipes" value="TODOS" />
                  {listaFiscais.map(f => <Picker.Item key={f.id} label={f.nome} value={f.id} />)}
                </Picker>
              </View>
            </View>
          </View>

          <Text style={styles.label}>Período de Fechamento:</Text>
          <View style={styles.row}>
            <View style={[styles.col, { flex: 1, marginRight: 5 }]}>
              <TextInput 
                style={styles.input} 
                value={dataInicial} 
                onChangeText={t => aplicarMascaraData(t, setDataInicial)} 
                placeholder="Data Inicial" 
                keyboardType="numeric" 
                maxLength={10}
              />
            </View>
            <View style={[styles.col, { flex: 1, marginRight: 5 }]}>
              <TextInput 
                style={styles.input} 
                value={dataFinal} 
                onChangeText={t => aplicarMascaraData(t, setDataFinal)} 
                placeholder="Data Final" 
                keyboardType="numeric" 
                maxLength={10}
              />
            </View>
          </View>

          <View style={styles.rowBotoesQuinzena}>
            <TouchableOpacity style={styles.btnQuinzena} onPress={() => setQuinzena(1)}>
              <Text style={styles.txtBtnQuinzena}>Preencher 1ª Quinzena</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnQuinzena} onPress={() => setQuinzena(2)}>
              <Text style={styles.txtBtnQuinzena}>Preencher 2ª Quinzena</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={[styles.btnPdf, gerandoPdf || resumoFuncionarios.length === 0 ? styles.btnPdfDisabled : null]} 
            onPress={gerarPDF} 
            disabled={gerandoPdf || resumoFuncionarios.length === 0}
          >
            {gerandoPdf ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.btnPdfText}>🖨️ Exportar Fechamento em PDF</Text>}
          </TouchableOpacity>
        </View>

        {carregando ? (
          <ActivityIndicator size="large" color="#27AE60" style={{ marginVertical: 40 }} />
        ) : resumoFuncionarios.length === 0 ? (
          <Text style={styles.emptyState}>Nenhum valor processado para este período.</Text>
        ) : (
          <View style={styles.dadosContainer}>
            
            {/* CARD DE TOTAL GERAL */}
            <View style={styles.cardGeral}>
              <View>
                <Text style={styles.cardGeralTitulo}>Total da Folha no Período</Text>
                <Text style={styles.cardGeralSub}>{resumoFuncionarios.length} Colaboradores Ativos</Text>
              </View>
              <Text style={styles.cardGeralValor}>R$ {totalGeral.toFixed(2).replace('.', ',')}</Text>
            </View>

            {/* TABELA 1: POR SERVIÇO */}
            <View style={styles.cardTabela}>
              <Text style={styles.tituloTabela}>📊 Custo Total por Serviço</Text>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 1, textAlign: 'left' }]}>Serviço</Text>
                <Text style={[styles.th, { width: 120, textAlign: 'right' }]}>Total (R$)</Text>
              </View>
              {resumoServicos.map((srv, idx) => (
                <View key={idx} style={[styles.tableRow, idx % 2 === 0 ? styles.rowEven : styles.rowOdd]}>
                  <Text style={[styles.td, { flex: 1, textAlign: 'left', color: '#34495E', fontWeight: 'bold' }]}>{srv.servico}</Text>
                  <Text style={[styles.td, { width: 120, textAlign: 'right', color: '#E67E22', fontWeight: 'bold' }]}>
                    R$ {srv.total.toFixed(2).replace('.', ',')}
                  </Text>
                </View>
              ))}
            </View>

            {/* TABELA 2: POR FUNCIONÁRIO */}
            <View style={styles.cardTabela}>
              <Text style={styles.tituloTabela}>👤 Pagamento por Funcionário</Text>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 1, textAlign: 'left' }]}>Colaborador</Text>
                <Text style={[styles.th, { width: 120, textAlign: 'right' }]}>Total (R$)</Text>
              </View>
              {resumoFuncionarios.map((func, idx) => (
                <View key={idx} style={[styles.tableRow, idx % 2 === 0 ? styles.rowEven : styles.rowOdd, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                  <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between' }}>
                    <Text style={[styles.td, { flex: 1, textAlign: 'left', fontWeight: 'bold', color: '#2C3E50', paddingBottom: 0 }]}>{func.colaborador}</Text>
                    <Text style={[styles.td, { width: 120, textAlign: 'right', color: '#27AE60', fontWeight: 'bold', fontSize: 16, paddingBottom: 0 }]}>
                      R$ {func.total.toFixed(2).replace('.', ',')}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10, color: '#7F8C8D', paddingHorizontal: 10, paddingBottom: 8, marginTop: 2 }}>
                    Serviços: {func.servicosFeitos}
                  </Text>
                </View>
              ))}
            </View>

          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { padding: 20, paddingTop: 30, backgroundColor: '#FFF', elevation: 2, borderBottomWidth: 1, borderBottomColor: '#E0E6ED' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 14, color: '#7F8C8D', marginTop: 2 },
  
  cardFiltros: { backgroundColor: '#FFFFFF', padding: 15, margin: 15, borderRadius: 12, elevation: 3 },
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 },
  col: { flex: 1 },
  label: { fontSize: 11, fontWeight: '700', color: '#34495E', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#F8FAFC', color: '#2C3E50' },
  
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', height: 42, justifyContent: 'center' },
  picker: { height: 68, width: '100%', fontSize: 12, color: '#2C3E50' },

  rowBotoesQuinzena: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, gap: 10 },
  btnQuinzena: { flex: 1, backgroundColor: '#E8F8F5', borderWidth: 1, borderColor: '#A9DFBF', paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  txtBtnQuinzena: { color: '#27AE60', fontWeight: 'bold', fontSize: 11 },

  btnPdf: { backgroundColor: '#2C3E50', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnPdfDisabled: { backgroundColor: '#95A5A6' },
  btnPdfText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },

  dadosContainer: { paddingHorizontal: 15, paddingBottom: 30 },
  emptyState: { textAlign: 'center', marginVertical: 40, color: '#95A5A6', fontSize: 15, fontStyle: 'italic' },
  
  cardGeral: { backgroundColor: '#27AE60', padding: 20, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 3, marginBottom: 20 },
  cardGeralTitulo: { color: '#E8F8F5', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },
  cardGeralSub: { color: '#A9DFBF', fontSize: 11, marginTop: 2 },
  cardGeralValor: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },

  cardTabela: { backgroundColor: '#FFF', borderRadius: 10, elevation: 2, marginBottom: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#E0E6ED' },
  tituloTabela: { fontSize: 15, fontWeight: 'bold', color: '#2980B9', padding: 15, backgroundColor: '#FDFEFE', borderBottomWidth: 1, borderBottomColor: '#EAEDED' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#ECF0F1', paddingVertical: 10 },
  th: { color: '#2C3E50', fontSize: 11, fontWeight: 'bold', paddingHorizontal: 10, textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F2F4F4', alignItems: 'center' },
  rowEven: { backgroundColor: '#FFFFFF' },
  rowOdd: { backgroundColor: '#FAFCFC' },
  td: { fontSize: 13, color: '#34495E', paddingHorizontal: 10 },
});