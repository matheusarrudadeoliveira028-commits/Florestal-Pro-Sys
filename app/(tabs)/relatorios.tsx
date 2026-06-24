import { Picker } from '@react-native-picker/picker';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

// 👉 ALGORITMO OFFLINE DE FERIADOS NACIONAIS (Fixos + Móveis como Páscoa e Carnaval)
const obterFeriadosNacionais = (ano: number) => {
  const feriados = [
    '01/01', // Confraternização Universal
    '21/04', // Tiradentes
    '01/05', // Dia do Trabalhador
    '07/09', // Independência do Brasil
    '12/10', // Nossa Senhora Aparecida
    '02/11', // Finados
    '15/11', // Proclamação da República
    '20/11', // Consciência Negra
    '25/12'  // Natal
  ];

  // Cálculo exato da Páscoa
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f_calc = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f_calc + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mesPascoa = Math.floor((h + l - 7 * m + 114) / 31);
  const diaPascoa = ((h + l - 7 * m + 114) % 31) + 1;

  const pascoa = new Date(ano, mesPascoa - 1, diaPascoa);

  const addDias = (data: Date, dias: number) => {
    const r = new Date(data);
    r.setDate(r.getDate() + dias);
    return r;
  };

  const formatar = (dts: Date) => `${String(dts.getDate()).padStart(2, '0')}/${String(dts.getMonth() + 1).padStart(2, '0')}`;

  feriados.push(formatar(addDias(pascoa, -47))); // Carnaval
  feriados.push(formatar(addDias(pascoa, -2)));  // Sexta-feira Santa
  feriados.push(formatar(addDias(pascoa, 60)));  // Corpus Christi

  // Converte para o formato ISO (YYYY-MM-DD) para facilitar a comparação no código
  return feriados.map(dMes => `${ano}-${dMes.split('/')[1]}-${dMes.split('/')[0]}`);
};

export default function RelatoriosScreen() {
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState('');
  
  // DATAS E FERIADOS
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [feriados, setFeriados] = useState('');

  const [listaColaboradores, setListaColaboradores] = useState<any[]>([]);
  const [gerando, setGerando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregarColaboradores();
    
    // Sugere o mês atual preenchido automaticamente
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    
    setDataInicio(primeiroDia.toLocaleDateString('pt-BR'));
    setDataFim(ultimoDia.toLocaleDateString('pt-BR'));
  }, []);

  const carregarColaboradores = async () => {
    setCarregando(true);
    const { data } = await supabase.from('colaboradores').select('*').order('nome');
    if (data) setListaColaboradores(data);
    setCarregando(false);
  };

  const converterDataParaBanco = (dataBR: string) => {
    const partes = dataBR.split('/');
    if (partes.length === 3) {
      return `${partes[2]}-${partes[1]}-${partes[0]}`;
    }
    return null;
  };

  const formatarDataIso = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // 👉 TRITURADOR DE NOMES
  const limparNome = (nome: string) => {
    if (!nome) return '';
    return nome.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  };

  // 👉 EXTRATOR UNIVERSAL DE DATAS (Resolve o bug do formato Americano x Brasileiro)
  const extrairAdmissaoISO = (admStr: any) => {
    if (!admStr) return null;
    let limpa = String(admStr).split('T')[0].split(' ')[0].trim();
    let a = 0, m = 0, d = 0;
    if (limpa.includes('/')) {
      const p = limpa.split('/');
      if (p.length === 3) {
          if (p[2].length >= 4) { a = parseInt(p[2], 10); m = parseInt(p[1], 10); d = parseInt(p[0], 10); }
          else { a = parseInt(p[0], 10); m = parseInt(p[1], 10); d = parseInt(p[2], 10); }
      }
    } else if (limpa.includes('-')) {
       const p = limpa.split('-');
       if (p.length === 3) {
           if (p[0].length >= 4) { a = parseInt(p[0], 10); m = parseInt(p[1], 10); d = parseInt(p[2], 10); }
           else { a = parseInt(p[2], 10); m = parseInt(p[1], 10); d = parseInt(p[0], 10); }
       }
    }
    if (a > 0 && m > 0 && d > 0 && !isNaN(a) && !isNaN(m) && !isNaN(d)) {
       if (a < 100) a += 2000;
       return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
  };

  const gerarPDF = async () => {
    if (!colaboradorSelecionado) return Alert.alert('Aviso', 'Selecione um colaborador (ou Todos)!');
    if (!dataInicio || !dataFim) return Alert.alert('Aviso', 'Preencha a data inicial e final!');

    const dtInicioBD = converterDataParaBanco(dataInicio);
    const dtFimBD = converterDataParaBanco(dataFim);

    if (!dtInicioBD || !dtFimBD) return Alert.alert('Erro', 'Use o formato DD/MM/AAAA para as datas.');

    const arrayFeriadosManuais = feriados.split(',').map(d => d.trim().padStart(2, '0')).filter(d => d !== '00');
    
    const anoInicial = parseInt(dtInicioBD.split('-')[0], 10);
    const anoFinal = parseInt(dtFimBD.split('-')[0], 10);
    let listaFeriadosNacionais = obterFeriadosNacionais(anoInicial);
    
    if (anoInicial !== anoFinal) {
      listaFeriadosNacionais = [...listaFeriadosNacionais, ...obterFeriadosNacionais(anoFinal)];
    }

    setGerando(true);

    try {
      // 👉 CARREGAMENTO DO LOGO À PROVA DE BALAS (EXPO GO + APK + WEB)
      let base64Logo = '';
      try {
        const asset = Asset.fromModule(require('../../assets/images/logo.png'));
        await asset.downloadAsync();
        
        if (Platform.OS === 'web') {
          base64Logo = asset.uri;
        } else {
          let uriDaImagem = asset.localUri || asset.uri;
          
          // Se for Expo Go (http), o Android bloqueia. Resolvemos baixando o arquivo fisicamente!
          if (uriDaImagem.startsWith('http')) {
            const { uri } = await FileSystem.downloadAsync(
              uriDaImagem,
              FileSystem.cacheDirectory + 'logo_temp_pdf.png'
            );
            uriDaImagem = uri;
          }
          
          // Converte para Base64 puro. O HTML renderiza nativamente sem bloqueios de segurança do Android.
          const base64 = await FileSystem.readAsStringAsync(uriDaImagem, {
            encoding: FileSystem.EncodingType.Base64,
          });
          base64Logo = `data:image/png;base64,${base64}`;
        }
      } catch (imgErr) {
        console.warn("Aviso: Não foi possível carregar a logo para o PDF.", imgErr);
      }

      let query = supabase.from('diarios_campo').select('*')
        .gte('data', `${dtInicioBD} 00:00:00`)
        .lte('data', `${dtFimBD} 23:59:59`)
        .order('data', { ascending: true });

      if (colaboradorSelecionado !== 'TODOS') {
        query = query.eq('colaborador', colaboradorSelecionado);
      }

      const { data: lancamentos, error: errLanc } = await query;
      if (errLanc) throw errLanc;

      if (!lancamentos || lancamentos.length === 0) {
        setGerando(false);
        return Alert.alert('Aviso', 'Nenhum lançamento encontrado neste período.');
      }

      const { data: feriasDB } = await supabase.from('ferias').select('*');

      const estaDeFerias = (nome: string, dataLancamento: string) => {
        const dataFormatada = dataLancamento.split('T')[0];
        return feriasDB?.some(f => 
          f.colaborador_nome === nome && 
          dataFormatada >= f.data_inicio && 
          dataFormatada <= f.data_fim
        );
      };

      const agrupado = lancamentos.reduce((acc: any, item: any) => {
        const tipoFolha = estaDeFerias(item.colaborador, item.data) ? 'Diaria' : 'Registrado';
        const chaveAgrupamento = `${item.colaborador}_${tipoFolha}`;

        if (!acc[chaveAgrupamento]) {
          acc[chaveAgrupamento] = {
            nome: item.colaborador,
            tipo: tipoFolha,
            registros: []
          };
        }
        acc[chaveAgrupamento].registros.push(item);
        return acc;
      }, {});

      const chavesFolhas = Object.keys(agrupado);
      let paginasHTML = '';

      chavesFolhas.forEach((chave, index) => {
        const folha = agrupado[chave];
        
        const totalGeral = folha.registros.reduce((soma: number, item: any) => soma + (item.valor_total || 0), 0);
        const totalQuantidade = folha.registros.reduce((soma: number, item: any) => soma + (Number(item.quantidade) || 0), 0);
        
        const encarregadoNome = folha.registros.length > 0 && folha.registros[0].fiscal_nome 
            ? folha.registros[0].fiscal_nome 
            : 'Não Identificado';

        const nomeLimpoFolha = limparNome(folha.nome);
        const dadosDoColaborador = listaColaboradores.find(c => limparNome(c.nome) === nomeLimpoFolha);
        
        let dataAdmissaoIsoStr: string | null = null;

        if (dadosDoColaborador) {
          const adm = dadosDoColaborador.data_admissao || dadosDoColaborador.created_at;
          dataAdmissaoIsoStr = extrairAdmissaoISO(adm);
        }

        let linhasTabela = '';
        
        const pIni = dtInicioBD.split('-');
        let dataAtualLoop = new Date(parseInt(pIni[0], 10), parseInt(pIni[1], 10) - 1, parseInt(pIni[2], 10), 12, 0, 0);

        const pFim = dtFimBD.split('-');
        const dataFimLoop = new Date(parseInt(pFim[0], 10), parseInt(pFim[1], 10) - 1, parseInt(pFim[2], 10), 12, 0, 0);

        while (dataAtualLoop <= dataFimLoop) {
          const isoDate = formatarDataIso(dataAtualLoop);
          const diaDaSemana = dataAtualLoop.getDay(); 
          const diaMesStr = isoDate.split('-')[2];

          const registrosDoDia = folha.registros.filter((r: any) => r.data.startsWith(isoDate));

          if (registrosDoDia.length > 0) {
            registrosDoDia.forEach((item: any) => {
              const valorUni = item.valor_unitario ? item.valor_unitario.toFixed(4).replace('.', ',') : '0,00';
              const valorTot = item.valor_total ? item.valor_total.toFixed(2).replace('.', ',') : '0,00';
              linhasTabela += `
                <tr>
                  <td>${diaMesStr}</td>
                  <td>${item.servico || '-'}</td>
                  <td>${item.fazenda || '-'}</td>
                  <td>${item.quadra || '-'}</td>
                  <td>${item.ramal || '-'}</td>
                  <td>${item.quantidade || '-'}</td>
                  <td>${valorUni}</td>
                  <td>R$ ${valorTot}</td>
                </tr>
              `;
            });
          } else {
            const isFeriadoManual = arrayFeriadosManuais.includes(diaMesStr);
            const isFeriadoNacional = listaFeriadosNacionais.includes(isoDate);
            const isFeriado = isFeriadoNacional || isFeriadoManual;

            const isFerias = feriasDB?.some((f: any) => 
              f.colaborador_nome === folha.nome && 
              isoDate >= f.data_inicio && 
              isoDate <= f.data_fim
            );
            
            const isAntesAdmissao = dataAdmissaoIsoStr !== null && (isoDate < dataAdmissaoIsoStr);
            
            if (isAntesAdmissao) {
              linhasTabela += `<tr><td><strong>${diaMesStr}</strong></td><td colspan="7" style="background-color: #F4F6F6;"></td></tr>`;
            } else if (isFerias) {
              linhasTabela += `<tr><td><strong>${diaMesStr}</strong></td><td colspan="7" style="background-color: #FEF9E7; color: #F39C12; font-weight: bold; letter-spacing: 2px;">FÉRIAS</td></tr>`;
            } else if (isFeriado) {
              linhasTabela += `<tr><td><strong>${diaMesStr}</strong></td><td colspan="7" style="background-color: #FADBD8; color: #C0392B; font-weight: bold; letter-spacing: 2px;">FERIADO</td></tr>`;
            } else if (diaDaSemana === 0) {
              linhasTabela += `<tr><td><strong>${diaMesStr}</strong></td><td colspan="7" style="background-color: #EAEDED; color: #7F8C8D; font-weight: bold; letter-spacing: 2px;">DOMINGO</td></tr>`;
            } else if (diaDaSemana === 6) {
              linhasTabela += `<tr><td><strong>${diaMesStr}</strong></td><td colspan="7" style="background-color: #EBF5FB; color: #2980B9; font-weight: bold; letter-spacing: 2px;">SÁBADO</td></tr>`;
            } else {
              linhasTabela += `<tr><td><strong>${diaMesStr}</strong></td><td colspan="7" style="background-color: #FDEDEC; color: #E74C3C; font-weight: bold; letter-spacing: 2px;">FALTA</td></tr>`;
            }
          }
          dataAtualLoop.setDate(dataAtualLoop.getDate() + 1);
        }

        const pagina = `
          <div class="page-container">
            <div class="header-container">
              ${base64Logo ? `<div class="header-logo"><img src="${base64Logo}" alt="Logo" /></div>` : ''}
              <div class="header-left">
                <p>Período: <strong>${dataInicio} até ${dataFim}</strong></p>
                <p>Encarregado: <strong style="text-transform: uppercase;">${encarregadoNome}</strong></p>
                ${folha.tipo === 'Registrado' ? '' : `<p>Produção: <strong style="color: #E74C3C; text-transform: uppercase;">${folha.tipo}</strong></p>`}
                <p>Colaborador: <strong style="font-size: 16px; text-transform: uppercase;">${folha.nome}</strong></p>
              </div>
              <div class="header-right">
                <p><strong>Luiz Felipe Areovaldo Calhim Manoel Abud</strong></p>
                <p>Fazenda Acauã s/n Bairro Pirambóia</p>
                <p>Anhembi SP Cep 18.620-000</p>
                <p>Tel: (14) 3361-7492/3361-9274 Escritório</p>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style="width: 8%;">Dia</th>
                  <th style="width: 25%;">Serviço</th>
                  <th style="width: 15%;">Fazenda</th>
                  <th style="width: 10%;">Quadra</th>
                  <th style="width: 10%;">Ramal</th>
                  <th style="width: 12%;">Qtd</th>
                  <th style="width: 10%;">Valor</th>
                  <th style="width: 10%;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${linhasTabela}
              </tbody>
            </table>

            <div class="footer-container">
              <div>
                <p style="margin-top: 40px; font-size: 12px; font-style: italic;">declaro ter recebido os valores acima</p>
              </div>
              <div class="footer-totals">
                <p style="font-size: 15px; margin-bottom: 8px;">Total Produzido: <strong>${totalQuantidade}</strong></p>
                <p style="font-size: 18px;">A receber: <strong>R$ ${totalGeral.toFixed(2).replace('.', ',')}</strong></p>
              </div>
            </div>

            <div class="signature-area">
              <hr style="width: 300px; border: 1px solid #000;">
              <p style="font-size: 14px; font-weight: bold;">Assinatura do Colaborador</p>
            </div>
          </div>
          ${index < chavesFolhas.length - 1 ? '<div class="quebra-pagina"></div>' : ''}
        `;

        paginasHTML += pagina;
      });

      const htmlCompleto = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Relatório de Produção - ${colaboradorSelecionado}</title>
            <style>
              @page { margin: 15mm; size: A4; }
              body { font-family: 'Arial', sans-serif; font-size: 13px; color: #000; background-color: #FFF; margin: 0; padding: 0; }
              .quebra-pagina { page-break-after: always; }
              .header-container { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; border-bottom: 2px solid #000; padding-bottom: 15px; }
              .header-logo { margin-right: 15px; display: flex; align-items: center; justify-content: center; }
              .header-logo img { max-height: 80px; max-width: 120px; object-fit: contain; }
              .header-left { flex: 1; }
              .header-left p, .header-right p { margin: 4px 0; font-size: 14px; }
              .header-right { text-align: right; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #000; padding: 6px 4px; text-align: center; font-size: 11px; }
              th { background-color: #E8E8E8; font-weight: bold; text-transform: uppercase; font-size: 10px; }
              tr:nth-child(even) { background-color: #F9F9F9; }
              .footer-container { display: flex; justify-content: space-between; margin-top: 30px; }
              .footer-totals p { margin: 4px 0; text-align: right; }
              .signature-area { margin-top: 80px; text-align: center; page-break-inside: avoid; }
            </style>
          </head>
          <body>
            ${paginasHTML}
          </body>
        </html>
      `;

      // 👉 BIFURCAÇÃO PERFEITA WEB x MOBILE
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
        // No ANDROID / iOS:
        const { uri } = await Print.printToFileAsync({ html: htmlCompleto });
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      }

    } catch (err: any) {
      Alert.alert('Erro', 'Ocorreu um problema ao gerar o PDF: ' + err.message);
    } finally {
      setGerando(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Folha de Produção 📄</Text>
        <Text style={styles.subtitle}>Gerar extratos por período</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Data Inicial:</Text>
            <TextInput style={styles.input} value={dataInicio} onChangeText={setDataInicio} placeholder="DD/MM/AAAA" keyboardType="numeric" />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>Data Final:</Text>
            <TextInput style={styles.input} value={dataFim} onChangeText={setDataFim} placeholder="DD/MM/AAAA" keyboardType="numeric" />
          </View>
        </View>

        <Text style={styles.label}>Feriados Municipais/Locais (Apenas os dias):</Text>
        <TextInput 
          style={styles.input} 
          value={feriados} 
          onChangeText={setFeriados} 
          placeholder="Ex: 01, 15 (Nacionais já são automáticos)" 
          keyboardType="numbers-and-punctuation" 
        />

        <Text style={styles.label}>Selecione o Colaborador:</Text>
        {carregando ? (
          <ActivityIndicator color="#2980B9" />
        ) : (
          <View style={styles.pickerContainer}>
            <Picker selectedValue={colaboradorSelecionado} onValueChange={setColaboradorSelecionado} style={styles.picker}>
              <Picker.Item label="Escolha..." value="" />
              <Picker.Item label="👉 TODOS OS FUNCIONÁRIOS" value="TODOS" />
              {listaColaboradores.map((item) => (
                <Picker.Item key={item.id} label={item.nome} value={item.nome} />
              ))}
            </Picker>
          </View>
        )}

        <TouchableOpacity style={[styles.button, gerando || !colaboradorSelecionado ? styles.buttonDisabled : null]} onPress={gerarPDF} disabled={gerando || !colaboradorSelecionado}>
          {gerando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Gerar Relatório em PDF</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', padding: 20 },
  header: { marginBottom: 30, marginTop: 20, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 16, color: '#7F8C8D', marginTop: 5 },
  card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 15, elevation: 5 },
  label: { fontSize: 14, fontWeight: '700', color: '#34495E', marginBottom: 10, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#F8FAFC', color: '#2C3E50', marginBottom: 10 },
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', overflow: 'hidden', marginBottom: 25, marginTop: 10 },
  picker: { height: 50, width: '100%', borderWidth: 0, backgroundColor: 'transparent' },
  button: { backgroundColor: '#2980B9', padding: 15, borderRadius: 8, alignItems: 'center' },
  buttonDisabled: { backgroundColor: '#AED6F1' },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { width: '48%' },
});