import { Picker } from '@react-native-picker/picker';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

export default function EstatisticasScreen() {
  const [carregando, setCarregando] = useState(false);
  const [gerandoPDF, setGerandoPDF] = useState(false);

  // FILTROS DE DATA (Padrão DD/MM/AAAA)
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  // FILTROS AVANÇADOS DE LOCALIZAÇÃO
  const [filtroFazenda, setFiltroFazenda] = useState('');
  const [filtroQuadra, setFiltroQuadra] = useState('');
  const [filtroRamal, setFiltroRamal] = useState('');
  
  // 👉 NOVO: SERVIÇO QUE SERÁ SEPARADO PARA ANÁLISE (EX: ESTRIA)
  const [servicoAnalise, setServicoAnalise] = useState('Estria');

  // LISTAS DE APOIO PARA OS FILTROS
  const [mapaCompleto, setMapaCompleto] = useState<any[]>([]);
  const [listaServicos, setListaServicos] = useState<any[]>([]);
  const [fazendasDisponiveis, setFazendasDisponiveis] = useState<string[]>([]);
  const [quadrasDisponiveis, setQuadrasDisponiveis] = useState<string[]>([]);
  const [ramaisDisponiveis, setRamaisDisponiveis] = useState<string[]>([]);

  // ESTADOS PARA OS DADOS PROCESSADOS
  const [totalGeral, setTotalGeral] = useState(0);
  const [totalAnalise, setTotalAnalise] = useState(0);
  const [dadosHierarquicos, setDadosHierarquicos] = useState<any>({});

  useEffect(() => {
    buscarDadosDeApoio();
    
    // Sugere o mês atual preenchido automaticamente
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    setDataInicio(primeiroDia.toLocaleDateString('pt-BR'));
    setDataFim(ultimoDia.toLocaleDateString('pt-BR'));
  }, []);

  const buscarDadosDeApoio = async () => {
    const { data: mapa } = await supabase.from('mapa_fazendas').select('*');
    if (mapa) {
      setMapaCompleto(mapa);
      setFazendasDisponiveis([...new Set(mapa.map(item => item.fazenda))] as string[]);
    }
    const { data: servs } = await supabase.from('servicos').select('*').order('nome');
    if (servs) setListaServicos(servs);
  };

  // Efeitos em Cascata para Filtros
  useEffect(() => {
    setFiltroQuadra(''); setFiltroRamal('');
    if (filtroFazenda) {
      setQuadrasDisponiveis([...new Set(mapaCompleto.filter(m => m.fazenda === filtroFazenda).map(m => m.quadra))] as string[]);
    } else setQuadrasDisponiveis([]);
  }, [filtroFazenda, mapaCompleto]);

  useEffect(() => {
    setFiltroRamal('');
    if (filtroQuadra) {
      setRamaisDisponiveis([...new Set(mapaCompleto.filter(m => m.fazenda === filtroFazenda && m.quadra === filtroQuadra).map(m => m.ramal))] as string[]);
    } else setRamaisDisponiveis([]);
  }, [filtroQuadra, filtroFazenda, mapaCompleto]);

  const formatarDataInput = (texto: string) => {
    let v = texto.replace(/\D/g, '');
    if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2);
    if (v.length > 5) v = v.substring(0, 5) + '/' + v.substring(5, 9);
    return v;
  };

  const converterParaISO = (dataBR: string) => {
    if (!dataBR) return null;
    const p = dataBR.split('/');
    if (p.length === 3 && p[2].length === 4) return `${p[2]}-${p[1]}-${p[0]}`;
    return null;
  };

  const carregarEstatisticas = async () => {
    setCarregando(true);

    const isoInicio = converterParaISO(dataInicio);
    const isoFim = converterParaISO(dataFim);

    let query = supabase.from('diarios_campo').select('data, servico, quantidade, fazenda, quadra, ramal').order('data', { ascending: true }); 

    if (isoInicio) query = query.gte('data', `${isoInicio}T00:00:00.000Z`);
    if (isoFim) query = query.lte('data', `${isoFim}T23:59:59.999Z`);
    if (filtroFazenda) query = query.eq('fazenda', filtroFazenda);
    if (filtroQuadra) query = query.eq('quadra', filtroQuadra);
    if (filtroRamal) query = query.eq('ramal', filtroRamal);

    const { data, error } = await query;

    if (error) {
      Alert.alert("🚨 Erro", "Não foi possível buscar os dados.");
      setCarregando(false);
      return;
    }

    if (data) processarDadosHierarquicos(data);
    else setCarregando(false);
  };

  // 👉 LÓGICA DE MESTRE: AGRUPAMENTO POR FAZENDA -> QUADRA -> RAMAL
  const processarDadosHierarquicos = (dados: any[]) => {
    let tGeral = 0;
    let tAnalise = 0;
    let arvore: any = {};

    dados.forEach((item) => {
      const f = item.fazenda || 'Sem Fazenda';
      const q = item.quadra || 'Sem Quadra';
      const r = item.ramal || 'Sem Ramal';
      const qtd = Number(item.quantidade) || 0;
      const isServicoAlvo = servicoAnalise && item.servico === servicoAnalise;

      // Inicia a estrutura se não existir
      if (!arvore[f]) arvore[f] = { quadras: {} };
      if (!arvore[f].quadras[q]) arvore[f].quadras[q] = { ramais: {} };
      if (!arvore[f].quadras[q].ramais[r]) arvore[f].quadras[q].ramais[r] = { producaoGeral: 0, producaoAlvo: 0, datasAlvo: [] };

      // Soma Geral (Tambores/Produção Geral) ou Específico (Estria)
      if (isServicoAlvo) {
        tAnalise += qtd;
        arvore[f].quadras[q].ramais[r].producaoAlvo += qtd;
        arvore[f].quadras[q].ramais[r].datasAlvo.push(item.data.split('T')[0]);
      } else {
        tGeral += qtd;
        arvore[f].quadras[q].ramais[r].producaoGeral += qtd;
      }
    });

    // Calcula os intervalos de retorno para cada ramal baseando-se nas datas coletadas
    Object.keys(arvore).forEach(f => {
      Object.keys(arvore[f].quadras).forEach(q => {
        Object.keys(arvore[f].quadras[q].ramais).forEach(r => {
          const ramalData = arvore[f].quadras[q].ramais[r];
          const datasUnicas = [...new Set(ramalData.datasAlvo)].sort() as string[]; // Remove datas repetidas do mesmo dia
          
          if (datasUnicas.length > 1) {
            const ultima = new Date(datasUnicas[datasUnicas.length - 1] + "T12:00:00Z");
            const penultima = new Date(datasUnicas[datasUnicas.length - 2] + "T12:00:00Z");
            const diffDias = Math.round(Math.abs(ultima.getTime() - penultima.getTime()) / (1000 * 60 * 60 * 24));
            
            arvore[f].quadras[q].ramais[r].intervalo = `${diffDias} dias`;
            arvore[f].quadras[q].ramais[r].ultimaData = datasUnicas[datasUnicas.length - 1].split('-').reverse().join('/');
          } else if (datasUnicas.length === 1) {
            arvore[f].quadras[q].ramais[r].intervalo = '1º do período';
            arvore[f].quadras[q].ramais[r].ultimaData = datasUnicas[0].split('-').reverse().join('/');
          } else {
            arvore[f].quadras[q].ramais[r].intervalo = '-';
            arvore[f].quadras[q].ramais[r].ultimaData = '-';
          }
        });
      });
    });

    setTotalGeral(tGeral);
    setTotalAnalise(tAnalise);
    setDadosHierarquicos(arvore);
    setCarregando(false);
  };

  const gerarPdfRelatorio = async () => {
    if (Object.keys(dadosHierarquicos).length === 0) return Alert.alert("Aviso", "Não há dados para gerar o relatório.");
    setGerandoPDF(true);

    try {
      // 👉 PDF À PROVA DE BALAS (CORRIGIDO PARA WEB E MOBILE)
      let base64Logo = '';
      try {
        const [asset] = await Asset.loadAsync(require('../../assets/images/logo.png'));
        if (Platform.OS === 'web') {
          base64Logo = asset.uri;
        } else {
          let uriToRead = asset.localUri || asset.uri;
          if (uriToRead.startsWith('http')) {
            const cacheDir = FileSystem.cacheDirectory || ''; 
            const tempFile = cacheDir + 'logo_estatisticas_temp.png';
            await FileSystem.downloadAsync(uriToRead, tempFile);
            uriToRead = tempFile;
          }
          // 👉 O TRUQUE DO BASE64 CORRIGIDO AQUI 
          const base64 = await FileSystem.readAsStringAsync(uriToRead, { encoding: 'base64' });
          base64Logo = `data:image/png;base64,${base64}`;
        }
      } catch (imgErr) {
        console.warn("Sem logo", imgErr);
      }

      // Monta as linhas do PDF baseando-se na árvore
      let htmlTabelas = '';

      Object.keys(dadosHierarquicos).forEach(faz => {
        htmlTabelas += `<div class="fazenda-title">📍 FAZENDA: ${faz.toUpperCase()}</div>`;
        
        Object.keys(dadosHierarquicos[faz].quadras).forEach(qd => {
          htmlTabelas += `
            <table>
              <thead>
                <tr>
                  <th colspan="5" class="quadra-header">QUADRA ${qd}</th>
                </tr>
                <tr>
                  <th style="width: 20%;">Ramal</th>
                  <th style="width: 20%;">Prod. Geral (Qtd)</th>
                  <th style="width: 20%; color: #8E44AD;">${servicoAnalise || 'Monitorado'}</th>
                  <th style="width: 20%;">Última Vez</th>
                  <th style="width: 20%;">Retorno</th>
                </tr>
              </thead>
              <tbody>
          `;
          
          Object.keys(dadosHierarquicos[faz].quadras[qd].ramais).forEach(rm => {
            const inf = dadosHierarquicos[faz].quadras[qd].ramais[rm];
            htmlTabelas += `
              <tr>
                <td><strong>Rm ${rm}</strong></td>
                <td>${inf.producaoGeral}</td>
                <td style="color: #8E44AD; font-weight: bold;">${inf.producaoAlvo}</td>
                <td>${inf.ultimaData}</td>
                <td>${inf.intervalo}</td>
              </tr>
            `;
          });
          htmlTabelas += `</tbody></table>`;
        });
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              @page { margin: 15mm; size: A4; }
              body { font-family: 'Arial', sans-serif; padding: 0; margin: 0; font-size: 12px; color: #333; }
              .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #27AE60; padding-bottom: 15px; margin-bottom: 20px; }
              .header-logo img { max-height: 70px; object-fit: contain; }
              h2 { color: #2C3E50; margin: 0; font-size: 20px; }
              .resumo-filtros { background-color: #F8FAFC; padding: 10px; border: 1px solid #BDC3C7; border-radius: 5px; margin-bottom: 20px; }
              .cards { display: flex; justify-content: space-between; margin-bottom: 20px; }
              .card { width: 48%; padding: 15px; border-radius: 5px; text-align: center; font-weight: bold; font-size: 16px; border: 1px solid #CCC; }
              .fazenda-title { background-color: #2C3E50; color: #FFF; padding: 8px; font-size: 14px; font-weight: bold; margin-top: 20px; border-radius: 4px 4px 0 0; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #BDC3C7; padding: 6px; text-align: center; }
              .quadra-header { background-color: #ECF0F1; color: #34495E; font-size: 13px; text-align: left; padding-left: 10px; }
            </style>
          </head>
          <body>
            <div class="header-container">
              ${base64Logo ? `<div class="header-logo"><img src="${base64Logo}" alt="Logo" /></div>` : '<div></div>'}
              <div style="text-align: right;">
                <h2>ESTATÍSTICAS DE PRODUÇÃO</h2>
                <p style="margin: 5px 0 0 0; color: #7F8C8D;">${dataInicio} a ${dataFim}</p>
              </div>
            </div>

            <div class="resumo-filtros">
              <strong>Filtros Ativos:</strong> 
              Fazenda: ${filtroFazenda || 'Todas'} | Quadra: ${filtroQuadra || 'Todas'} | Ramal: ${filtroRamal || 'Todos'}
            </div>

            <div class="cards">
              <div class="card" style="background-color: #FEF5E7; color: #D35400;">PRODUÇÃO GERAL (QTD)<br><span style="font-size: 22px;">${totalGeral}</span></div>
              <div class="card" style="background-color: #F4ECF7; color: #8E44AD;">${servicoAnalise ? servicoAnalise.toUpperCase() : 'MONITORADO'}<br><span style="font-size: 22px;">${totalAnalise}</span></div>
            </div>

            ${htmlTabelas}

          </body>
        </html>
      `;

      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute'; iframe.style.width = '0px'; iframe.style.height = '0px'; iframe.style.border = 'none';
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (doc) { doc.open(); doc.write(htmlContent); doc.close(); }
        setTimeout(() => {
          if (iframe.contentWindow) { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
          setTimeout(() => { document.body.removeChild(iframe); }, 1000);
        }, 500);
      } else {
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      }
    } catch (e) {
      Alert.alert("Erro", "Falha ao gerar PDF.");
    } finally {
      setGerandoPDF(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Métricas e Produção 📊</Text>
          <Text style={styles.subtitle}>Análise Hierárquica da Fazenda</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          
          {/* BLOCO DE FILTROS */}
          <View style={styles.filtrosContainer}>
            <Text style={styles.secaoTitle}>Período de Análise:</Text>
            <View style={styles.row}>
              <View style={styles.colData}>
                <TextInput style={styles.inputData} placeholder="Início (DD/MM/AAAA)" keyboardType="numeric" value={dataInicio} onChangeText={(t) => setDataInicio(formatarDataInput(t))} maxLength={10} />
              </View>
              <View style={styles.colData}>
                <TextInput style={styles.inputData} placeholder="Fim (DD/MM/AAAA)" keyboardType="numeric" value={dataFim} onChangeText={(t) => setDataFim(formatarDataInput(t))} maxLength={10} />
              </View>
            </View>

            <Text style={[styles.secaoTitle, {marginTop: 15}]}>Serviço Monitorado (Estria / Retorno):</Text>
            <View style={styles.pickerModalContainer}>
              <Picker selectedValue={servicoAnalise} onValueChange={setServicoAnalise}>
                <Picker.Item label="Nenhum (Tudo como Geral)" value="" />
                {listaServicos.map(s => <Picker.Item key={s.id} label={s.nome} value={s.nome} />)}
              </Picker>
            </View>
            <Text style={styles.avisoMicro}>*O serviço escolhido acima será separado da Produção Geral e o sistema calculará os dias de retorno para ele.</Text>

            <Text style={[styles.secaoTitle, {marginTop: 15, borderTopWidth: 1, borderTopColor: '#ECF0F1', paddingTop: 10}]}>Localização Específica (Opcional):</Text>
            <View style={styles.row}>
              <View style={styles.colData}>
                <View style={styles.pickerModalContainer}>
                  <Picker selectedValue={filtroFazenda} onValueChange={setFiltroFazenda}>
                    <Picker.Item label="Todas Fazendas" value="" />
                    {fazendasDisponiveis.map(f => <Picker.Item key={f} label={f} value={f} />)}
                  </Picker>
                </View>
              </View>
              <View style={[styles.colData, !filtroFazenda && styles.disabled]}>
                <View style={styles.pickerModalContainer}>
                  <Picker enabled={!!filtroFazenda} selectedValue={filtroQuadra} onValueChange={setFiltroQuadra}>
                    <Picker.Item label="Todas Quadras" value="" />
                    {quadrasDisponiveis.map(q => <Picker.Item key={q} label={`Qd: ${q}`} value={q} />)}
                  </Picker>
                </View>
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.colData, !filtroQuadra && styles.disabled]}>
                <View style={styles.pickerModalContainer}>
                  <Picker enabled={!!filtroQuadra} selectedValue={filtroRamal} onValueChange={setFiltroRamal}>
                    <Picker.Item label="Todos Ramais" value="" />
                    {ramaisDisponiveis.map(r => <Picker.Item key={r} label={`Rm: ${r}`} value={r} />)}
                  </Picker>
                </View>
              </View>
            </View>

            <View style={{flexDirection: 'row', gap: 10, marginTop: 15}}>
              <TouchableOpacity style={styles.btnBuscar} onPress={carregarEstatisticas} disabled={carregando}>
                {carregando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnTextoBranco}>🔍 BUSCAR DADOS</Text>}
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.btnPdf} onPress={gerarPdfRelatorio} disabled={gerandoPDF || Object.keys(dadosHierarquicos).length === 0}>
                {gerandoPDF ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnTextoBranco}>🖨️ PDF</Text>}
              </TouchableOpacity>
            </View>
          </View>

          {/* ÁREA DE RESULTADOS */}
          <View style={styles.scroll}>
            {carregando ? (
              <ActivityIndicator size="large" color="#27AE60" style={{marginTop: 50}} />
            ) : (
              <>
                {Object.keys(dadosHierarquicos).length > 0 && (
                  <View style={styles.cardsRow}>
                    <View style={[styles.cardTotal, { borderLeftColor: '#E67E22' }]}>
                      <Text style={styles.cardTitulo}>Produção Geral</Text>
                      <Text style={styles.cardValorLaranja}>{totalGeral}</Text>
                    </View>
                    <View style={[styles.cardTotal, { borderLeftColor: '#8E44AD' }]}>
                      <Text style={styles.cardTitulo}>{servicoAnalise || 'Monitorado'}</Text>
                      <Text style={styles.cardValorRoxo}>{totalAnalise}</Text>
                    </View>
                  </View>
                )}

                {Object.keys(dadosHierarquicos).length === 0 && !carregando ? (
                   <Text style={styles.vazio}>Selecione as datas e clique em Buscar.</Text>
                ) : (
                  Object.keys(dadosHierarquicos).map((faz) => (
                    <View key={faz} style={styles.fazendaContainer}>
                      <Text style={styles.fazendaTitulo}>📍 Fazenda {faz}</Text>
                      
                      {Object.keys(dadosHierarquicos[faz].quadras).map((qd) => (
                        <View key={qd} style={styles.quadraContainer}>
                          <Text style={styles.quadraTitulo}>Quadra {qd}</Text>
                          
                          {Object.keys(dadosHierarquicos[faz].quadras[qd].ramais).map((rm) => {
                            const ramalInfo = dadosHierarquicos[faz].quadras[qd].ramais[rm];
                            return (
                              <View key={rm} style={styles.ramalContainer}>
                                <View style={styles.ramalHeader}>
                                  <Text style={styles.ramalTitulo}>Ramal {rm}</Text>
                                  <View style={styles.retornoBadge}>
                                    <Text style={styles.retornoTexto}>Retorno: {ramalInfo.intervalo}</Text>
                                  </View>
                                </View>
                                
                                <View style={styles.metricasRow}>
                                  <Text style={styles.metricaProd}>Geral: {ramalInfo.producaoGeral}</Text>
                                  <Text style={styles.metricaAlvo}>🎯 {servicoAnalise || 'Alvo'}: {ramalInfo.producaoAlvo}</Text>
                                </View>
                              </View>
                            )
                          })}
                        </View>
                      ))}
                    </View>
                  ))
                )}
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F4F7' },
  header: { marginTop: 45, marginBottom: 10, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 13, color: '#7F8C8D' },
  
  filtrosContainer: { paddingHorizontal: 15, marginBottom: 10, backgroundColor: '#FFF', paddingVertical: 15, borderRadius: 10, marginHorizontal: 10, elevation: 3 },
  secaoTitle: { fontSize: 13, fontWeight: 'bold', color: '#34495E', marginBottom: 8 },
  avisoMicro: { fontSize: 10, color: '#95A5A6', marginTop: 5, fontStyle: 'italic' },
  
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  colData: { width: '48%' },
  inputData: { backgroundColor: '#F8FAFC', borderRadius: 8, padding: 10, fontSize: 14, color: '#2C3E50', textAlign: 'center', fontWeight: 'bold', borderWidth: 1, borderColor: '#DCDFE6' },
  pickerModalContainer: { borderWidth: 1, borderColor: '#DCDFE6', borderRadius: 8, backgroundColor: '#F8FAFC', overflow: 'hidden', height: 45, justifyContent: 'center' },
  disabled: { opacity: 0.5 },

  btnBuscar: { flex: 3, backgroundColor: '#2980B9', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnPdf: { flex: 1, backgroundColor: '#E67E22', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnTextoBranco: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },

  scroll: { paddingHorizontal: 10, paddingTop: 10 },
  vazio: { textAlign: 'center', color: '#95A5A6', fontStyle: 'italic', marginVertical: 20 },
  
  cardsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  cardTotal: { backgroundColor: '#FFF', width: '48%', padding: 15, borderRadius: 10, borderLeftWidth: 5, elevation: 2 },
  cardTitulo: { fontSize: 12, color: '#7F8C8D', fontWeight: 'bold' },
  cardValorLaranja: { fontSize: 22, color: '#D35400', fontWeight: 'bold', marginTop: 5 },
  cardValorRoxo: { fontSize: 22, color: '#8E44AD', fontWeight: 'bold', marginTop: 5 },

  // ESTILOS DA HIERARQUIA
  fazendaContainer: { backgroundColor: '#FFF', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2, borderWidth: 1, borderColor: '#E0E6ED' },
  fazendaTitulo: { fontSize: 16, fontWeight: 'bold', color: '#2C3E50', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#ECF0F1', paddingBottom: 5 },
  
  quadraContainer: { backgroundColor: '#F8FAFC', borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#D5DBDB' },
  quadraTitulo: { fontSize: 14, fontWeight: 'bold', color: '#34495E', marginBottom: 8 },
  
  ramalContainer: { backgroundColor: '#FFF', borderRadius: 6, padding: 10, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#3498DB', elevation: 1 },
  ramalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  ramalTitulo: { fontSize: 13, fontWeight: 'bold', color: '#2980B9' },
  
  retornoBadge: { backgroundColor: '#FDEDEC', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  retornoTexto: { fontSize: 10, color: '#C0392B', fontWeight: 'bold' },
  
  metricasRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  metricaProd: { fontSize: 12, fontWeight: 'bold', color: '#7F8C8D' },
  metricaAlvo: { fontSize: 12, fontWeight: 'bold', color: '#8E44AD' },
});