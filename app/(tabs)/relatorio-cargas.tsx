import { Picker } from '@react-native-picker/picker';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

export default function RelatorioCargasScreen() {
  const [fazendaSelecionada, setFazendaSelecionada] = useState('TODAS');
  const [tipoCargaSelecionado, setTipoCargaSelecionado] = useState('TODAS'); // 🟢 NOVO FILTRO
  const [listaFazendas, setListaFazendas] = useState<string[]>([]);
  
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  
  const [dadosAgrupados, setDadosAgrupados] = useState<any>({});
  const [carregando, setCarregando] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  // Totais Gerais
  const [totalPesoGeral, setTotalPesoGeral] = useState(0);
  const [totalTamboresGeral, setTotalTamboresGeral] = useState(0);
  const [totalCargasGeral, setTotalCargasGeral] = useState(0);
  const [totalVolumeGeral, setTotalVolumeGeral] = useState(0); 

  useEffect(() => {
    const hoje = new Date();
    const dia = String(hoje.getDate()).padStart(2, '0');
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const ano = hoje.getFullYear();
    
    setDataInicial(`01/${mes}/${ano}`);
    setDataFinal(`${dia}/${mes}/${ano}`);
    
    carregarFazendas();
  }, []);

  useEffect(() => {
    if (dataInicial.length === 10 && dataFinal.length === 10) {
      buscarCargas();
    }
  }, [dataInicial, dataFinal, fazendaSelecionada, tipoCargaSelecionado]); // 🟢 REAGE AO NOVO FILTRO

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

  const carregarFazendas = async () => {
    const { data } = await supabase.from('mapa_fazendas').select('fazenda');
    if (data) {
      const unicas = [...new Set(data.map(item => item.fazenda?.toUpperCase()).filter(Boolean))].sort();
      setListaFazendas(unicas as string[]);
    }
  };

  const buscarCargas = async () => {
    const dataIniBD = converterDataParaBanco(dataInicial);
    const dataFimBD = converterDataParaBanco(dataFinal);
    
    if (!dataIniBD || !dataFimBD) return;

    setCarregando(true);
    try {
      let query = supabase
        .from('carregamentos') 
        .select('*')
        .gte('data_saida', `${dataIniBD}`) 
        .lte('data_saida', `${dataFimBD} 23:59:59`) 
        .order('data_saida', { ascending: true });

      if (fazendaSelecionada !== 'TODAS') {
        query = query.ilike('fazenda', fazendaSelecionada);
      }

      // 🟢 APLICAÇÃO DO FILTRO DE CARGA NO BANCO
      if (tipoCargaSelecionado !== 'TODAS') {
        query = query.eq('tipo_carga', tipoCargaSelecionado);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        const agrupamento = data.reduce((acc: any, item: any) => {
          const fazenda = (item.fazenda || 'NÃO INFORMADA').toUpperCase();
          
          if (!acc[fazenda]) {
            acc[fazenda] = { cargas: [], total_peso: 0, total_tambores: 0, total_volume: 0 };
          }
          
          const peso = Number(item.peso_liquido) || 0;
          const tambores = Number(item.quantidade) || 0;
          const volume = Number(item.madeira_volume) || 0; 

          acc[fazenda].cargas.push({
            data: item.data_saida ? item.data_saida.split('T')[0] : '-',
            romaneio: item.numero_romaneio || '-',
            tipo_carga: item.tipo_carga || 'Goma Resina',
            variedade: item.variedade || '-',
            peso: peso,
            tambores: tambores,
            volume: volume,
            media_tambor: tambores > 0 ? peso / tambores : 0,
            observacao: item.observacao || ''
          });

          acc[fazenda].total_peso += peso;
          acc[fazenda].total_tambores += tambores;
          acc[fazenda].total_volume += volume;

          return acc;
        }, {});

        setDadosAgrupados(agrupamento);

        let tPeso = 0; let tTambores = 0; let tCargas = 0; let tVolume = 0;
        Object.keys(agrupamento).forEach(faz => {
          tPeso += agrupamento[faz].total_peso;
          tTambores += agrupamento[faz].total_tambores;
          tVolume += agrupamento[faz].total_volume;
          tCargas += agrupamento[faz].cargas.length;
        });

        setTotalPesoGeral(tPeso);
        setTotalTamboresGeral(tTambores);
        setTotalCargasGeral(tCargas);
        setTotalVolumeGeral(tVolume);

      } else {
        setDadosAgrupados({});
        setTotalPesoGeral(0); setTotalTamboresGeral(0); setTotalCargasGeral(0); setTotalVolumeGeral(0);
      }
    } catch (err: any) {
      Alert.alert('Erro', 'Não foi possível carregar os carregamentos.');
    } finally {
      setCarregando(false);
    }
  };

  const gerarPDF = async () => {
    if (Object.keys(dadosAgrupados).length === 0) {
      return Alert.alert('Aviso', 'Não há dados para gerar o PDF no período selecionado.');
    }
    setGerandoPdf(true);

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

      let htmlBlocosFazenda = '';
      
      Object.keys(dadosAgrupados).sort().forEach(fazenda => {
        const dados = dadosAgrupados[fazenda];

        const cargasResina = dados.cargas.filter((c:any) => c.tipo_carga !== 'Madeira');
        const totalPesoResina = cargasResina.reduce((acc: number, curr: any) => acc + curr.peso, 0);
        const mediaCarga = cargasResina.length > 0 ? (totalPesoResina / cargasResina.length) : 0;

        let linhasTabela = '';
        dados.cargas.forEach((c: any) => {
          const dtBr = c.data !== '-' ? `${c.data.split('-')[2]}/${c.data.split('-')[1]}/${c.data.split('-')[0]}` : '-';
          
          const infoTotal = c.tipo_carga === 'Madeira' 
            ? `<td style="color: #8E44AD; font-weight: bold;">${c.volume.toFixed(2).replace('.', ',')} m³</td>`
            : `<td style="color: #E67E22; font-weight: bold;">${c.peso.toLocaleString('pt-BR')} kg</td>`;

          const infoMedia = c.tipo_carga === 'Madeira'
            ? `<td style="color: #95A5A6;">-</td>`
            : `<td style="color: #27AE60; font-weight: bold;">${c.media_tambor > 0 ? c.media_tambor.toFixed(2).replace('.', ',') + ' kg' : '-'}</td>`;

          linhasTabela += `
            <tr>
              <td>${dtBr}</td>
              <td style="font-weight: bold; color: #2C3E50;">${c.romaneio}</td>
              <td><div style="font-size: 9px; font-weight: bold; color: ${c.tipo_carga === 'Madeira' ? '#8E44AD' : '#F39C12'}">${c.tipo_carga}</div>${c.variedade}</td>
              <td>${c.tambores || '-'}</td>
              ${infoTotal}
              ${infoMedia}
            </tr>
          `;
        });

        htmlBlocosFazenda += `
          <div class="fazenda-container">
            <div class="fazenda-header">
              <h2>📍 FAZENDA ${fazenda}</h2>
              <div class="fazenda-resumo">
                <span><strong>Cargas:</strong> ${dados.cargas.length}</span> | 
                <span><strong>Tambores:</strong> ${dados.total_tambores}</span> | 
                <span><strong>Peso:</strong> <span style="color:#27AE60;">${dados.total_peso.toLocaleString('pt-BR')} kg</span></span> | 
                <span><strong>Volume:</strong> <span style="color:#8E44AD;">${dados.total_volume.toFixed(2).replace('.', ',')} m³</span></span> | 
                <span><strong>Média/Carga:</strong> ${mediaCarga.toFixed(2).replace('.', ',')} kg</span>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width:12%">Data Saída</th>
                  <th style="width:18%">Nº Romaneio</th>
                  <th style="width:20%">Tipo/Variedade</th>
                  <th style="width:10%">Tambores</th>
                  <th style="width:20%">Tot (Kg/m³)</th>
                  <th style="width:20%">Média kg/Tb</th>
                </tr>
              </thead>
              <tbody>
                ${linhasTabela}
              </tbody>
            </table>
          </div>
        `;
      });

      const mediaGeralCarga = totalCargasGeral > 0 ? totalPesoGeral / totalCargasGeral : 0;

      const htmlCompleto = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              @page { margin: 15mm; size: A4 portrait; }
              body { font-family: 'Arial', sans-serif; font-size: 11px; color: #333; margin: 0; padding: 0; }
              .header-container { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #2C3E50; padding-bottom: 15px; }
              .header-logo img { max-height: 50px; }
              h1 { margin: 0; font-size: 18px; color: #2C3E50; text-transform: uppercase; }
              .resumo-global { display: flex; justify-content: space-between; background-color: #2C3E50; color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
              .resumo-global-box { text-align: center; width: 19%; border-right: 1px solid #34495E; }
              .resumo-global-box:last-child { border-right: none; }
              .resumo-global-titulo { font-size: 9px; color: #BDC3C7; text-transform: uppercase; margin-bottom: 4px; }
              .resumo-global-valor { font-size: 16px; font-weight: bold; color: #F1C40F; }
              
              .fazenda-container { margin-bottom: 25px; page-break-inside: avoid; }
              .fazenda-header { background-color: #F8FAFC; border: 1px solid #BDC3C7; border-bottom: none; padding: 10px; border-top-left-radius: 6px; border-top-right-radius: 6px; }
              .fazenda-header h2 { margin: 0 0 5px 0; font-size: 14px; color: #2980B9; }
              .fazenda-resumo { font-size: 11px; color: #34495E; }
              
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #BDC3C7; padding: 6px; text-align: center; }
              th { background-color: #ECF0F1; color: #2C3E50; font-size: 10px; text-transform: uppercase; }
              tr:nth-child(even) { background-color: #FDFEFE; }
              tr:nth-child(odd) { background-color: #F4F6F6; }
            </style>
          </head>
          <body>
            <div class="header-container">
              ${base64Logo ? `<div class="header-logo"><img src="${base64Logo}" /></div>` : ''}
              <div style="text-align: right;">
                <h1>Relatório de Coletas e Cargas</h1>
                <p style="margin: 4px 0 0 0;">Período: <strong>${dataInicial} a ${dataFinal}</strong></p>
                <p style="margin: 4px 0 0 0;">Fazenda(s): <strong style="text-transform: uppercase;">${fazendaSelecionada}</strong></p>
                <p style="margin: 4px 0 0 0;">Tipo Carga: <strong style="text-transform: uppercase;">${tipoCargaSelecionado}</strong></p>
              </div>
            </div>

            <div class="resumo-global">
              <div class="resumo-global-box">
                <div class="resumo-global-titulo">Total Cargas</div>
                <div class="resumo-global-valor">${totalCargasGeral}</div>
              </div>
              <div class="resumo-global-box">
                <div class="resumo-global-titulo">Tambores</div>
                <div class="resumo-global-valor">${totalTamboresGeral}</div>
              </div>
              <div class="resumo-global-box">
                <div class="resumo-global-titulo">Média (Kg/Carga)</div>
                <div class="resumo-global-valor">${mediaGeralCarga.toFixed(0).replace('.', ',')} kg</div>
              </div>
              <div class="resumo-global-box">
                <div class="resumo-global-titulo">Peso Exp.</div>
                <div class="resumo-global-valor" style="color: #2ECC71;">${totalPesoGeral.toLocaleString('pt-BR')} kg</div>
              </div>
              <div class="resumo-global-box">
                <div class="resumo-global-titulo">Volume Exp.</div>
                <div class="resumo-global-valor" style="color: #9B59B6;">${totalVolumeGeral.toFixed(2).replace('.', ',')} m³</div>
              </div>
            </div>

            ${htmlBlocosFazenda}

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
      Alert.alert('Erro', 'Ocorreu um erro ao gerar o PDF.');
    } finally {
      setGerandoPdf(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Relatório de Coletas 🚛</Text>
        <Text style={styles.subtitle}>Controle de Cargas, Resina e Madeira</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        <View style={styles.cardFiltros}>
          
          {/* 🟢 LINHA 1: DATAS */}
          <View style={styles.row}>
            <View style={[styles.col, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>Data Inicial:</Text>
              <TextInput 
                style={styles.input} 
                value={dataInicial} 
                onChangeText={t => aplicarMascaraData(t, setDataInicial)} 
                placeholder="DD/MM/AAAA" 
                keyboardType="numeric" 
                maxLength={10}
              />
            </View>
            <View style={[styles.col, { flex: 1 }]}>
              <Text style={styles.label}>Data Final:</Text>
              <TextInput 
                style={styles.input} 
                value={dataFinal} 
                onChangeText={t => aplicarMascaraData(t, setDataFinal)} 
                placeholder="DD/MM/AAAA" 
                keyboardType="numeric" 
                maxLength={10}
              />
            </View>
          </View>

          {/* 🟢 LINHA 2: FAZENDA E TIPO DE CARGA */}
          <View style={styles.row}>
            <View style={[styles.col, { flex: 1.2, marginRight: 8 }]}>
              <Text style={styles.label}>Fazenda:</Text>
              <View style={styles.pickerContainer}>
                <Picker 
                  selectedValue={fazendaSelecionada} 
                  onValueChange={setFazendaSelecionada} 
                  style={styles.picker}
                >
                  <Picker.Item label="Todas Fazendas" value="TODAS" />
                  {listaFazendas.map(f => <Picker.Item key={f} label={f} value={f} />)}
                </Picker>
              </View>
            </View>
            
            <View style={[styles.col, { flex: 1 }]}>
              <Text style={styles.label}>Tipo Carga:</Text>
              <View style={styles.pickerContainer}>
                <Picker 
                  selectedValue={tipoCargaSelecionado} 
                  onValueChange={setTipoCargaSelecionado} 
                  style={styles.picker}
                >
                  <Picker.Item label="Todas" value="TODAS" />
                  <Picker.Item label="Goma Resina" value="Goma Resina" />
                  <Picker.Item label="Madeira" value="Madeira" />
                </Picker>
              </View>
            </View>
          </View>

          {/* INDICADORES GLOBAIS COM MADEIRA */}
          <View style={styles.resumoContainer}>
            <View style={styles.resumoBox}>
              <Text style={styles.resumoTitulo}>Total Cargas</Text>
              <Text style={styles.resumoValorAzul}>{totalCargasGeral}</Text>
            </View>
            <View style={styles.resumoBox}>
              <Text style={styles.resumoTitulo}>Total Tambores</Text>
              <Text style={styles.resumoValorLaranja}>{totalTamboresGeral}</Text>
            </View>
            <View style={styles.resumoBox}>
              <Text style={styles.resumoTitulo}>Média / Carga</Text>
              <Text style={styles.resumoValorPadrao}>
                {totalCargasGeral > 0 ? (totalPesoGeral / totalCargasGeral).toFixed(0).replace('.', ',') : 0} kg
              </Text>
            </View>
            <View style={[styles.resumoBox, { width: '48%' }]}>
              <Text style={styles.resumoTitulo}>Peso Expedido</Text>
              <Text style={styles.resumoValorVerde}>
                {totalPesoGeral.toLocaleString('pt-BR')} kg
              </Text>
            </View>
            <View style={[styles.resumoBox, { width: '48%' }]}>
              <Text style={styles.resumoTitulo}>Volume Exp. (Madeira)</Text>
              <Text style={[styles.resumoValorVerde, { color: '#8E44AD' }]}>
                {totalVolumeGeral.toFixed(2).replace('.', ',')} m³
              </Text>
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.btnPdf, gerandoPdf || Object.keys(dadosAgrupados).length === 0 ? styles.btnPdfDisabled : null]} 
            onPress={gerarPDF} 
            disabled={gerandoPdf || Object.keys(dadosAgrupados).length === 0}
          >
            {gerandoPdf ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.btnPdfText}>🖨️ Exportar Fechamento em PDF</Text>}
          </TouchableOpacity>
        </View>

        {/* RENDERIZAÇÃO HIERÁRQUICA: FECHAMENTO POR FAZENDA */}
        <View style={styles.listaContainer}>
          {carregando ? (
            <ActivityIndicator size="large" color="#2980B9" style={{ marginVertical: 40 }} />
          ) : Object.keys(dadosAgrupados).length === 0 ? (
            <Text style={styles.emptyState}>Nenhuma carga registrada neste período com este filtro.</Text>
          ) : (
            Object.keys(dadosAgrupados).sort().map(fazenda => {
              const dados = dadosAgrupados[fazenda];
              
              const cargasResina = dados.cargas.filter((c:any) => c.tipo_carga !== 'Madeira');
              const mediaFazenda = cargasResina.length > 0 ? (cargasResina.reduce((acc: number, curr: any) => acc + curr.peso, 0) / cargasResina.length) : 0;

              return (
                <View key={fazenda} style={styles.cardFazenda}>
                  
                  {/* CABEÇALHO DA FAZENDA COM TAG DE VOLUME */}
                  <View style={styles.headerFazenda}>
                    <Text style={styles.tituloFazenda}>📍 FAZENDA {fazenda}</Text>
                    <View style={styles.tagsFazendaContainer}>
                       <View style={styles.tagFazenda}><Text style={styles.tagTextoFazenda}>{dados.cargas.length} Cargas</Text></View>
                       {dados.total_tambores > 0 && <View style={styles.tagFazenda}><Text style={styles.tagTextoFazenda}>{dados.total_tambores} Tbs</Text></View>}
                       {dados.total_peso > 0 && <View style={[styles.tagFazenda, {backgroundColor: '#27AE60'}]}><Text style={[styles.tagTextoFazenda, {color: '#FFF'}]}>{dados.total_peso.toLocaleString('pt-BR')} KG</Text></View>}
                       {dados.total_volume > 0 && <View style={[styles.tagFazenda, {backgroundColor: '#8E44AD'}]}><Text style={[styles.tagTextoFazenda, {color: '#FFF'}]}>{dados.total_volume.toFixed(2).replace('.', ',')} m³</Text></View>}
                    </View>
                  </View>

                  {/* TABELA MISTA DE ROMANEIOS DA FAZENDA */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ minWidth: '100%' }}>
                      <View style={styles.tableHeader}>
                        <Text style={[styles.th, { width: 80 }]}>Data Saída</Text>
                        <Text style={[styles.th, { width: 90 }]}>Nº Romaneio</Text>
                        <Text style={[styles.th, { width: 100 }]}>Tipo / Var.</Text>
                        <Text style={[styles.th, { width: 60, textAlign: 'center' }]}>Qtd</Text>
                        <Text style={[styles.th, { width: 90, textAlign: 'center' }]}>Tot (Kg/m³)</Text>
                        <Text style={[styles.th, { width: 80, textAlign: 'right' }]}>Média kg/Tb</Text>
                      </View>

                      {dados.cargas.map((c: any, index: number) => {
                         const dtBr = c.data !== '-' ? `${c.data.split('-')[2]}/${c.data.split('-')[1]}/${c.data.split('-')[0]}` : '-';
                         const isMadeira = c.tipo_carga === 'Madeira';

                         return (
                          <View key={index} style={[styles.tableRow, index % 2 === 0 ? styles.rowEven : styles.rowOdd]}>
                            <Text style={[styles.td, { width: 80 }]}>{dtBr}</Text>
                            <Text style={[styles.td, { width: 90, fontWeight: 'bold', color: '#2980B9' }]}>{c.romaneio}</Text>
                            <View style={{ width: 100, paddingHorizontal: 10, justifyContent: 'center' }}>
                              <Text style={{ fontSize: 9, fontWeight: 'bold', color: isMadeira ? '#8E44AD' : '#F39C12' }}>{c.tipo_carga}</Text>
                              <Text style={{ fontSize: 11, color: '#34495E' }}>{c.variedade}</Text>
                            </View>
                            <Text style={[styles.td, { width: 60, textAlign: 'center', fontWeight: 'bold' }]}>{c.tambores || '-'}</Text>
                            
                            <Text style={[styles.td, { width: 90, textAlign: 'center', fontWeight: 'bold', color: isMadeira ? '#8E44AD' : '#E67E22' }]}>
                              {isMadeira ? `${c.volume.toFixed(2).replace('.', ',')} m³` : `${c.peso.toLocaleString('pt-BR')} kg`}
                            </Text>
                            
                            <Text style={[styles.td, { width: 80, textAlign: 'right', color: '#27AE60', fontWeight: 'bold' }]}>
                              {!isMadeira && c.media_tambor > 0 ? `${c.media_tambor.toFixed(2).replace('.', ',')} kg` : '-'}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                  
                  {/* RODAPÉ DE MÉDIA DA FAZENDA */}
                  {mediaFazenda > 0 && (
                    <View style={styles.footerFazenda}>
                      <Text style={styles.textoFooterFazenda}>Média de Goma Resina da Fazenda por Carga: <Text style={{fontWeight: 'bold', color: '#2C3E50'}}>{mediaFazenda.toFixed(2).replace('.', ',')} kg</Text></Text>
                    </View>
                  )}

                </View>
              );
            })
          )}
        </View>
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
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  col: { },
  label: { fontSize: 11, fontWeight: '700', color: '#34495E', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#F8FAFC', color: '#2C3E50' },
  
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', height: 42, justifyContent: 'center' },
  picker: { height: 68, width: '100%', fontSize: 12, color: '#2C3E50' },

  resumoContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 5, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#ECF0F1' },
  resumoBox: { width: '31%', alignItems: 'center', marginBottom: 10 },
  resumoTitulo: { fontSize: 9, color: '#7F8C8D', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 5 },
  resumoValorAzul: { fontSize: 18, fontWeight: 'bold', color: '#2980B9' },
  resumoValorVerde: { fontSize: 18, fontWeight: 'bold', color: '#27AE60' },
  resumoValorLaranja: { fontSize: 18, fontWeight: 'bold', color: '#E67E22' },
  resumoValorPadrao: { fontSize: 18, fontWeight: 'bold', color: '#34495E' },

  btnPdf: { backgroundColor: '#34495E', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  btnPdfDisabled: { backgroundColor: '#95A5A6' },
  btnPdfText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },

  listaContainer: { paddingHorizontal: 15, paddingBottom: 30 },
  emptyState: { textAlign: 'center', marginVertical: 40, color: '#95A5A6', fontSize: 15, fontStyle: 'italic' },
  
  cardFazenda: { backgroundColor: '#FFF', borderRadius: 10, elevation: 2, marginBottom: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#E0E6ED' },
  headerFazenda: { padding: 12, backgroundColor: '#FDFEFE', borderBottomWidth: 1, borderBottomColor: '#EAEDED' },
  tituloFazenda: { fontSize: 14, fontWeight: 'bold', color: '#2C3E50', marginBottom: 8 },
  tagsFazendaContainer: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  tagFazenda: { backgroundColor: '#F4F6F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: '#E0E6ED' },
  tagTextoFazenda: { fontSize: 10, fontWeight: 'bold', color: '#34495E' },
  
  tableHeader: { flexDirection: 'row', backgroundColor: '#ECF0F1', paddingVertical: 10 },
  th: { color: '#2C3E50', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 10, textTransform: 'uppercase' },
  
  tableRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F2F4F4', alignItems: 'center' },
  rowEven: { backgroundColor: '#FFFFFF' },
  rowOdd: { backgroundColor: '#FAFCFC' },
  td: { fontSize: 11, color: '#34495E', paddingHorizontal: 10 },
  
  footerFazenda: { padding: 10, backgroundColor: '#FDFEFE', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: '#EAEDED' },
  textoFooterFazenda: { fontSize: 11, color: '#7F8C8D' }
});