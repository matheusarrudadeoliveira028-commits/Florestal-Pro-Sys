import { Picker } from '@react-native-picker/picker';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase'; // Ajuste o caminho se necessário

export default function AcompanhamentoScreen() {
  const [fiscalSelecionado, setFiscalSelecionado] = useState('TODOS');
  const [listaFiscais, setListaFiscais] = useState<string[]>([]);
  const [dataSelecionada, setDataSelecionada] = useState('');
  const [registros, setRegistros] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false); // 🟢 Estado para o botão de PDF

  // Totais do dia
  const [totalQtd, setTotalQtd] = useState(0);
  const [totalValor, setTotalValor] = useState(0);

  // Pega a data de hoje no formato DD/MM/AAAA para iniciar a tela
  useEffect(() => {
    const hoje = new Date();
    const dia = String(hoje.getDate()).padStart(2, '0');
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const ano = hoje.getFullYear();
    setDataSelecionada(`${dia}/${mes}/${ano}`);
    
    carregarFiscais();
  }, []);

  // Recarrega os dados sempre que a data ou o fiscal mudar
  useEffect(() => {
    if (dataSelecionada.length === 10) {
      buscarProducaoDoDia();
    }
  }, [dataSelecionada, fiscalSelecionado]);

  // 👇 NOVA FUNÇÃO: Máscara Automática de Data
  const aplicarMascaraData = (texto: string) => {
    let valorSujo = texto.replace(/\D/g, ''); // Remove letras e símbolos
    if (valorSujo.length > 8) valorSujo = valorSujo.substring(0, 8); // Trava em 8 dígitos

    if (valorSujo.length > 4) {
      valorSujo = valorSujo.replace(/^(\d{2})(\d{2})(\d+)/, '$1/$2/$3');
    } else if (valorSujo.length > 2) {
      valorSujo = valorSujo.replace(/^(\d{2})(\d+)/, '$1/$2');
    }

    setDataSelecionada(valorSujo);
  };

  const carregarFiscais = async () => {
    const { data } = await supabase.from('diarios_campo').select('fiscal_nome');
    if (data) {
      const unicos = [...new Set(data.map(item => item.fiscal_nome).filter(Boolean))];
      setListaFiscais(unicos.sort() as string[]);
    }
  };

  const converterDataParaBanco = (dataBR: string) => {
    const partes = dataBR.split('/');
    if (partes.length === 3) {
      return `${partes[2]}-${partes[1]}-${partes[0]}`;
    }
    return null;
  };

  const buscarProducaoDoDia = async () => {
    const dataBD = converterDataParaBanco(dataSelecionada);
    if (!dataBD) return;

    setCarregando(true);
    try {
      let query = supabase
        .from('diarios_campo')
        .select('*')
        .gte('data', `${dataBD} 00:00:00`)
        .lte('data', `${dataBD} 23:59:59`)
        .order('colaborador', { ascending: true });

      if (fiscalSelecionado !== 'TODOS') {
        query = query.eq('fiscal_nome', fiscalSelecionado);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data) {
        // 👉 ALGORITMO DE AGRUPAMENTO (Unifica os registros iguais)
        const registrosAgrupados = data.reduce((acc: any, item: any) => {
          const chave = `${item.colaborador}_${item.servico}_${item.fazenda}_${item.quadra}_${item.valor_unitario}`;
          
          if (!acc[chave]) {
            acc[chave] = {
              ...item,
              quantidade: Number(item.quantidade) || 0,
              valor_total: Number(item.valor_total) || 0,
              ramais: item.ramal ? [String(item.ramal)] : []
            };
          } else {
            acc[chave].quantidade += Number(item.quantidade) || 0;
            acc[chave].valor_total += Number(item.valor_total) || 0;
            if (item.ramal) {
              acc[chave].ramais.push(String(item.ramal));
            }
          }
          return acc;
        }, {});

        // Converte o objeto agrupado de volta para um array e formata os ramais
        const dadosUnificados = Object.values(registrosAgrupados).map((item: any) => {
          const ramaisUnicos = [...new Set(item.ramais)];
          return {
            ...item,
            ramal: ramaisUnicos.join(', ') || '-'
          };
        });

        // Ordena novamente pelo nome do colaborador por garantia
        dadosUnificados.sort((a: any, b: any) => a.colaborador.localeCompare(b.colaborador));

        setRegistros(dadosUnificados);
        
        // Calcula os totais do painel (usando os dados unificados para manter a exatidão)
        const sumQtd = dadosUnificados.reduce((acc, item: any) => acc + (Number(item.quantidade) || 0), 0);
        const sumValor = dadosUnificados.reduce((acc, item: any) => acc + (Number(item.valor_total) || 0), 0);
        setTotalQtd(sumQtd);
        setTotalValor(sumValor);
      } else {
        setRegistros([]);
        setTotalQtd(0);
        setTotalValor(0);
      }
    } catch (err: any) {
      Alert.alert('Erro', 'Não foi possível carregar os dados do dia.');
      console.log(err);
    } finally {
      setCarregando(false);
    }
  };

  // 🟢 FUNÇÃO PARA GERAR O PDF DO DIA
  const gerarPDF = async () => {
    if (registros.length === 0) {
      return Alert.alert('Aviso', 'Não há registros para gerar o PDF neste dia.');
    }

    setGerandoPdf(true);

    try {
      // 1. Processamento da Logo (compatível com web e mobile)
      let base64Logo = '';
      try {
        const asset = Asset.fromModule(require('../../assets/images/logo.png'));
        await asset.downloadAsync();
        
        if (Platform.OS === 'web') {
          base64Logo = asset.uri;
        } else {
          let uriDaImagem = asset.localUri || asset.uri;
          if (uriDaImagem.startsWith('http')) {
            const { uri } = await FileSystem.downloadAsync(
              uriDaImagem,
              FileSystem.cacheDirectory + 'logo_temp_pdf.png'
            );
            uriDaImagem = uri;
          }
          const base64 = await FileSystem.readAsStringAsync(uriDaImagem, {
            encoding: FileSystem.EncodingType.Base64,
          });
          base64Logo = `data:image/png;base64,${base64}`;
        }
      } catch (imgErr) {
        console.warn("Aviso: Não foi possível carregar a logo para o PDF.", imgErr);
      }

      // 2. Monta as linhas da tabela em HTML
      let linhasTabela = '';
      registros.forEach((item: any) => {
        const valorUni = item.valor_unitario ? Number(item.valor_unitario).toFixed(4).replace('.', ',') : '0,00';
        const valorTot = item.valor_total ? Number(item.valor_total).toFixed(2).replace('.', ',') : '0,00';
        
        linhasTabela += `
          <tr>
            <td style="text-align: left; font-weight: bold;">${item.colaborador}</td>
            <td style="text-align: left;">${item.servico || '-'}</td>
            <td>${item.quadra || '-'}</td>
            <td>${item.ramal || '-'}</td>
            <td><strong>${item.quantidade || '0'}</strong></td>
            <td>R$ ${valorUni}</td>
            <td style="color: #27AE60;"><strong>R$ ${valorTot}</strong></td>
          </tr>
        `;
      });

      // 3. Monta o HTML Completo do PDF
      const htmlCompleto = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Relatório Diário de Produção</title>
            <style>
              @page { margin: 15mm; size: A4 portrait; }
              body { font-family: 'Arial', sans-serif; font-size: 11px; color: #333; margin: 0; padding: 0; }
              .header-container { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #2C3E50; padding-bottom: 15px; }
              .header-logo { margin-right: 15px; }
              .header-logo img { max-height: 60px; max-width: 120px; object-fit: contain; }
              .header-info { flex: 1; text-align: right; }
              h1 { margin: 0; font-size: 18px; color: #2C3E50; text-transform: uppercase; }
              p { margin: 4px 0; font-size: 12px; }
              .resumo-container { display: flex; justify-content: space-between; margin-bottom: 20px; background-color: #F8F9F9; padding: 15px; border-radius: 8px; border: 1px solid #E5E8E8; }
              .resumo-box { text-align: center; width: 48%; }
              .resumo-titulo { font-size: 11px; color: #7F8C8D; font-weight: bold; text-transform: uppercase; margin-bottom: 5px; }
              .resumo-valor { font-size: 18px; font-weight: bold; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; }
              th, td { border: 1px solid #BDC3C7; padding: 6px 4px; text-align: center; }
              th { background-color: #2C3E50; color: #FFF; font-weight: bold; text-transform: uppercase; font-size: 10px; }
              tr:nth-child(even) { background-color: #F4F6F6; }
            </style>
          </head>
          <body>
            <div class="header-container">
              ${base64Logo ? `<div class="header-logo"><img src="${base64Logo}" alt="Logo" /></div>` : ''}
              <div class="header-info">
                <h1>Acompanhamento Diário</h1>
                <p>Data de Referência: <strong>${dataSelecionada}</strong></p>
                <p>Equipe / Fiscal: <strong style="text-transform: uppercase;">${fiscalSelecionado}</strong></p>
              </div>
            </div>

            <div class="resumo-container">
              <div class="resumo-box">
                <div class="resumo-titulo">Total Produzido (Qtd)</div>
                <div class="resumo-valor" style="color: #2980B9;">${totalQtd}</div>
              </div>
              <div class="resumo-box">
                <div class="resumo-titulo">Total em Reais (R$)</div>
                <div class="resumo-valor" style="color: #27AE60;">R$ ${totalValor.toFixed(2).replace('.', ',')}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 25%; text-align: left;">Funcionário</th>
                  <th style="width: 25%; text-align: left;">Serviço</th>
                  <th style="width: 10%;">Quadra</th>
                  <th style="width: 10%;">Ramal</th>
                  <th style="width: 10%;">Qtd</th>
                  <th style="width: 10%;">V. Unit</th>
                  <th style="width: 10%;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${linhasTabela}
              </tbody>
            </table>
          </body>
        </html>
      `;

      // 4. Compartilhamento do PDF
      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (doc) {
          doc.open();
          doc.write(htmlCompleto);
          doc.close();
        }

        setTimeout(() => {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          }
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1000);
        }, 500);

      } else {
        const { uri } = await Print.printToFileAsync({ html: htmlCompleto });
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      }
    } catch (err: any) {
      Alert.alert('Erro', 'Ocorreu um problema ao gerar o PDF: ' + err.message);
    } finally {
      setGerandoPdf(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Produção do Dia 📊</Text>
        <Text style={styles.subtitle}>Acompanhamento em tempo real</Text>
      </View>

      {/* PAINEL DE FILTROS E AÇÕES */}
      <View style={styles.cardFiltros}>
        <View style={styles.row}>
          <View style={[styles.col, { flex: 0.4 }]}>
            <Text style={styles.label}>Data:</Text>
            {/* 👇 MÁSCARA APLICADA NO ONCHANGETEXT 👇 */}
            <TextInput 
              style={styles.input} 
              value={dataSelecionada} 
              onChangeText={aplicarMascaraData} 
              placeholder="DD/MM/AAAA" 
              keyboardType="numeric" 
              maxLength={10}
            />
          </View>
          <View style={[styles.col, { flex: 0.55 }]}>
            <Text style={styles.label}>Equipe (Fiscal):</Text>
            <View style={styles.pickerContainer}>
              <Picker 
                selectedValue={fiscalSelecionado} 
                onValueChange={setFiscalSelecionado} 
                style={styles.picker}
              >
                <Picker.Item label="Todas Equipes" value="TODOS" />
                {listaFiscais.map((nome, index) => (
                  <Picker.Item key={index} label={nome} value={nome} />
                ))}
              </Picker>
            </View>
          </View>
        </View>

        {/* RESUMO DO DIA */}
        <View style={styles.resumoContainer}>
          <View style={styles.resumoBox}>
            <Text style={styles.resumoTitulo}>Total Produzido (Qtd)</Text>
            <Text style={styles.resumoValorAzul}>{totalQtd}</Text>
          </View>
          <View style={styles.resumoBox}>
            <Text style={styles.resumoTitulo}>Total em Reais (R$)</Text>
            <Text style={styles.resumoValorVerde}>
              R$ {totalValor.toFixed(2).replace('.', ',')}
            </Text>
          </View>
        </View>

        {/* 🟢 BOTÃO DE GERAR PDF */}
        <TouchableOpacity 
          style={[styles.btnPdf, gerandoPdf || registros.length === 0 ? styles.btnPdfDisabled : null]} 
          onPress={gerarPDF} 
          disabled={gerandoPdf || registros.length === 0}
        >
          {gerandoPdf ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.btnPdfText}>🖨️ Exportar PDF do Dia</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* TABELA DE DADOS */}
      <View style={styles.tabelaContainer}>
        {carregando ? (
          <ActivityIndicator size="large" color="#2980B9" style={{ marginTop: 50 }} />
        ) : registros.length === 0 ? (
          <Text style={styles.emptyState}>Nenhum serviço registrado neste dia.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View>
              {/* CABEÇALHO DA TABELA */}
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { width: 150 }]}>Funcionário</Text>
                <Text style={[styles.th, { width: 140 }]}>Serviço</Text>
                <Text style={[styles.th, { width: 80, textAlign: 'center' }]}>Quadra</Text>
                <Text style={[styles.th, { width: 100, textAlign: 'center' }]}>Ramal</Text>
                <Text style={[styles.th, { width: 70, textAlign: 'center' }]}>Qtd</Text>
                <Text style={[styles.th, { width: 90, textAlign: 'right' }]}>Valor Unit.</Text>
                <Text style={[styles.th, { width: 90, textAlign: 'right' }]}>Total</Text>
              </View>

              {/* LINHAS DA TABELA */}
              <ScrollView>
                {registros.map((item, index) => (
                  <View key={index} style={[styles.tableRow, index % 2 === 0 ? styles.rowEven : styles.rowOdd]}>
                    <Text style={[styles.td, { width: 150, fontWeight: 'bold' }]} numberOfLines={1}>
                      {item.colaborador}
                    </Text>
                    <Text style={[styles.td, { width: 140 }]} numberOfLines={1}>
                      {item.servico || '-'}
                    </Text>
                    <Text style={[styles.td, { width: 80, textAlign: 'center' }]}>
                      {item.quadra || '-'}
                    </Text>
                    <Text style={[styles.td, { width: 100, textAlign: 'center' }]}>
                      {item.ramal || '-'}
                    </Text>
                    <Text style={[styles.td, { width: 70, textAlign: 'center', fontWeight: 'bold' }]}>
                      {item.quantidade || '0'}
                    </Text>
                    <Text style={[styles.td, { width: 90, textAlign: 'right' }]}>
                      R$ {item.valor_unitario ? Number(item.valor_unitario).toFixed(4).replace('.', ',') : '0,00'}
                    </Text>
                    <Text style={[styles.td, { width: 90, textAlign: 'right', color: '#27AE60', fontWeight: 'bold' }]}>
                      R$ {item.valor_total ? Number(item.valor_total).toFixed(2).replace('.', ',') : '0,00'}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { padding: 20, paddingTop: 30, backgroundColor: '#FFF', elevation: 2, borderBottomWidth: 1, borderBottomColor: '#E0E6ED' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 14, color: '#7F8C8D', marginTop: 2 },
  
  cardFiltros: { backgroundColor: '#FFFFFF', padding: 15, margin: 15, borderRadius: 12, elevation: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  col: { justifyContent: 'flex-end' },
  label: { fontSize: 12, fontWeight: '700', color: '#34495E', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#F8FAFC', color: '#2C3E50' },
  
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', height: 42, justifyContent: 'center' },
  picker: { height: 42, width: '100%', borderWidth: 0, backgroundColor: 'transparent' },
  
  resumoContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#ECF0F1' },
  resumoBox: { flex: 1, alignItems: 'center' },
  resumoTitulo: { fontSize: 11, color: '#7F8C8D', fontWeight: '600', textTransform: 'uppercase' },
  resumoValorAzul: { fontSize: 22, fontWeight: 'bold', color: '#2980B9', marginTop: 4 },
  resumoValorVerde: { fontSize: 22, fontWeight: 'bold', color: '#27AE60', marginTop: 4 },

  btnPdf: { backgroundColor: '#34495E', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  btnPdfDisabled: { backgroundColor: '#95A5A6' },
  btnPdfText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },

  tabelaContainer: { flex: 1, backgroundColor: '#FFF', marginHorizontal: 15, marginBottom: 15, borderRadius: 12, elevation: 3, overflow: 'hidden' },
  emptyState: { textAlign: 'center', marginTop: 40, color: '#95A5A6', fontSize: 15, fontStyle: 'italic' },
  
  tableHeader: { flexDirection: 'row', backgroundColor: '#2C3E50', paddingVertical: 12, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  th: { color: '#FFF', fontSize: 13, fontWeight: 'bold', paddingHorizontal: 10 },
  
  tableRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#ECF0F1' },
  rowEven: { backgroundColor: '#FDFEFE' },
  rowOdd: { backgroundColor: '#F4F6F6' },
  td: { fontSize: 13, color: '#2C3E50', paddingHorizontal: 10 },
});