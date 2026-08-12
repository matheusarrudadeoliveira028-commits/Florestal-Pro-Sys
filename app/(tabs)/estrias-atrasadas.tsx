import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

const PESO_TAMBOR_KG = 200;

// 🟢 SERVIÇOS TRAVADOS (EXATAMENTE COMO NA SUA IMAGEM)
const TIPOS_ESTRIA = [
  'ESTRIA BAIXA (1º ATÉ 5º ESTRIA)',
  'ESTRIA EM V (VEZINHO) ATÉ 2.80 MTS DE ALTURA',
  'ESTRIA EM V (VEZÃO)',
  'ABERTURA EM V (COM RETIRADA DE LATERAL)',
  'ABERTURA DE ESTRIA NORMAL ',
  'ESTRIAS NORMAL'
];

interface EstriaInfo {
  texto: string;
  isAtrasada: boolean;
  diasAtraso: number;
}

interface LinhaCronograma {
  id: string;
  quadra_nome: string;
  quadra_raw: string;
  ciclo_num: number;
  qtde_arvores: number;
  estrias: EstriaInfo[]; 
  proxima_estria: string | null;
  status: string;
  dias_atraso: number;
  total_tambores: number;
  gr_estria: number;
  tbs_mil: number;
  is_ciclo_fechado: boolean;
}

interface DadosIniciais {
  coletasFeitas: string;
  estriasFeitas: string;
  dataUltimaEstria: string;
  tambores: string;
}

const getSafraAtual = () => {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1; 
  return mes >= 7 ? `${ano}/${ano + 1}` : `${ano - 1}/${ano}`;
};

const gerarListaSafras = () => {
  const ano = new Date().getFullYear();
  return [`${ano - 2}/${ano - 1}`, `${ano - 1}/${ano}`, `${ano}/${ano + 1}`, `${ano + 1}/${ano + 2}`];
};

export default function EstriasAtrasadasScreen() {
  const [dados, setDados] = useState<LinhaCronograma[]>([]);
  const [loading, setLoading] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  
  const [fazendaSelecionada, setFazendaSelecionada] = useState<string>('');
  const [fazendasDisponiveis, setFazendasDisponiveis] = useState<string[]>([]);
  const [safraSelecionada, setSafraSelecionada] = useState<string>(getSafraAtual());
  const [coletaSelecionada, setColetaSelecionada] = useState<string>('Todas');
  
  // TOTAIS
  const [totalArvoresGeral, setTotalArvoresGeral] = useState(0);
  const [totalTamboresGeral, setTotalTamboresGeral] = useState(0);
  const [mediaKgArvore, setMediaKgArvore] = useState(0);
  const [mediaGrEstria, setMediaGrEstria] = useState(0);

  // 🟢 ESTADOS DOS DADOS INICIAIS
  const [dadosIniciaisGlobais, setDadosIniciaisGlobais] = useState<Record<string, DadosIniciais>>({});
  const [modalInicialVisible, setModalInicialVisible] = useState(false);
  const [quadraEditando, setQuadraEditando] = useState<string>('');
  const [formInicial, setFormInicial] = useState<DadosIniciais>({ coletasFeitas: '0', estriasFeitas: '0', dataUltimaEstria: '', tambores: '0' });

  useEffect(() => {
    inicializarTela();
  }, []);

  useEffect(() => {
    if (fazendaSelecionada) {
      buscarCronogramaDaFazenda();
    }
  }, [fazendaSelecionada, safraSelecionada, coletaSelecionada]);

  const inicializarTela = async () => {
    try {
      const salvosIniciais = await AsyncStorage.getItem('@dados_iniciais_cronograma');
      if (salvosIniciais) setDadosIniciaisGlobais(JSON.parse(salvosIniciais));

      const { data: mapa } = await supabase.from('mapa_fazendas').select('fazenda');
      if (mapa) {
        const unicas = [...new Set(mapa.map(item => item.fazenda?.toUpperCase()).filter(Boolean))].sort();
        setFazendasDisponiveis(unicas as string[]);
        if (unicas.length > 0) setFazendaSelecionada(unicas[0] as string);
      }
    } catch (error) {
      console.log('Erro ao inicializar:', error);
    }
  };

  // MÁSCARA DE DATA
  const aplicarMascaraData = (texto: string) => {
    let v = texto.replace(/\D/g, ''); 
    if (v.length > 8) v = v.substring(0, 8); 
    if (v.length > 4) v = v.replace(/^(\d{2})(\d{2})(\d+)/, '$1/$2/$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d+)/, '$1/$2');
    setFormInicial(prev => ({...prev, dataUltimaEstria: v}));
  };

  const abrirModalInicial = (quadra: string) => {
    const chave = `${safraSelecionada}_${fazendaSelecionada}_${quadra}`;
    const existente = dadosIniciaisGlobais[chave] || { coletasFeitas: '0', estriasFeitas: '0', dataUltimaEstria: '', tambores: '0' };
    setFormInicial(existente);
    setQuadraEditando(quadra);
    setModalInicialVisible(true);
  };

  const salvarDadosIniciais = async () => {
    const chave = `${safraSelecionada}_${fazendaSelecionada}_${quadraEditando}`;
    const novoObj = { ...dadosIniciaisGlobais, [chave]: formInicial };
    await AsyncStorage.setItem('@dados_iniciais_cronograma', JSON.stringify(novoObj));
    setDadosIniciaisGlobais(novoObj);
    setModalInicialVisible(false);
    buscarCronogramaDaFazenda();
  };

  const buscarCronogramaDaFazenda = async () => {
    if (!fazendaSelecionada) return;
    setLoading(true);
    
    try {
      const { data: mapa, error: errorMapa } = await supabase
        .from('mapa_fazendas')
        .select('quadra, total_pes')
        .ilike('fazenda', fazendaSelecionada)
        .limit(10000); 

      if (errorMapa) {
        Alert.alert("Erro no Mapa", errorMapa.message);
        setLoading(false); return;
      }

      const arvoresPorQuadra: Record<string, number> = {};
      mapa?.forEach(item => {
        const qdr = item.quadra ? String(item.quadra).trim().toUpperCase() : 'N/A';
        if (!arvoresPorQuadra[qdr]) arvoresPorQuadra[qdr] = 0;
        arvoresPorQuadra[qdr] += Number(item.total_pes) || 0;
      });

      const { data: diarios, error: errorDiarios } = await supabase
        .from('diarios_campo')
        .select('quadra, data, servico, quantidade')
        .ilike('fazenda', fazendaSelecionada)
        .order('data', { ascending: true })
        .limit(20000); 

      if (errorDiarios) {
        Alert.alert("Erro nos Diários", errorDiarios.message);
        setLoading(false); return;
      }

      const [anoInicio, anoFim] = safraSelecionada.split('/');
      const dataInicioSafra = new Date(`${anoInicio}-07-01T00:00:00Z`);
      const dataFimSafra = new Date(`${anoFim}-06-30T23:59:59Z`);

      const diariosSafra = diarios?.filter(d => {
        if (!d.data) return false;
        const dt = new Date(`${String(d.data).split('T')[0]}T12:00:00Z`);
        return dt >= dataInicioSafra && dt <= dataFimSafra;
      }) || [];

      const arrayQuadras = Object.keys(arvoresPorQuadra).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      let dadosFinais: LinhaCronograma[] = [];

      arrayQuadras.forEach(qdr => {
        const totalPesQuadra = arvoresPorQuadra[qdr] || 0;
        const diariosQuadra = diariosSafra.filter(d => String(d.quadra).trim().toUpperCase() === qdr);
        
        // 🟢 PUXA OS DADOS INICIAIS DA QUADRA
        const chaveInicial = `${safraSelecionada}_${fazendaSelecionada}_${qdr}`;
        const configIni = dadosIniciaisGlobais[chaveInicial] || { coletasFeitas: '0', estriasFeitas: '0', dataUltimaEstria: '', tambores: '0' };
        
        const colFeitas = parseInt(configIni.coletasFeitas) || 0;
        const estFeitas = parseInt(configIni.estriasFeitas) || 0;
        const tamboresIniciais = parseInt(configIni.tambores) || 0;

        let ciclosQuadra: any[] = [];
        
        // Inicia o ciclo baseando-se em quantas coletas já foram encerradas antes
        let cicloAtual = { 
            num: colFeitas + 1, 
            estrias: [] as any[], 
            estriaAberta: null as any, 
            totalTambores: tamboresIniciais 
        };

        // 🟢 INJETA AS ESTRIAS INICIAIS (FANTASMAS)
        for(let i = 0; i < estFeitas; i++) {
           let dt = new Date('2020-01-01T12:00:00Z'); 
           if (i === estFeitas - 1 && configIni.dataUltimaEstria) {
               const partes = configIni.dataUltimaEstria.split('/');
               if (partes.length === 3) {
                   dt = new Date(`${partes[2]}-${partes[1]}-${partes[0]}T12:00:00Z`);
               }
           }
           cicloAtual.estrias.push({ inicio: dt, fim: dt, qtdTotal: totalPesQuadra, isHistorico: true });
        }

        // Processa os diários lançados pelo aplicativo
        diariosQuadra.forEach(d => {
          if (!d.data || !d.servico) return;
          const dtStr = String(d.data).split('T')[0].split(' ')[0];
          const dt = new Date(`${dtStr}T12:00:00Z`);
          const qtd = Number(d.quantidade) || 0;
          const servicoStr = String(d.servico).trim().toUpperCase();

          const isEstria = TIPOS_ESTRIA.includes(servicoStr);
          const isColeta = servicoStr.includes('COLETA');

          if (isEstria) {
            if (cicloAtual.totalTambores > tamboresIniciais) {
              if (cicloAtual.estriaAberta) {
                cicloAtual.estrias.push(cicloAtual.estriaAberta);
                cicloAtual.estriaAberta = null;
              }
              ciclosQuadra.push(cicloAtual);
              cicloAtual = { num: cicloAtual.num + 1, estrias: [], estriaAberta: null, totalTambores: 0 };
            }

            if (!cicloAtual.estriaAberta) {
              cicloAtual.estriaAberta = { inicio: dt, fim: dt, qtdTotal: qtd, isHistorico: false };
            } else {
              const jaCompletou = totalPesQuadra > 0 && cicloAtual.estriaAberta.qtdTotal >= (totalPesQuadra * 0.85);
              const diffDias = Math.abs(dt.getTime() - cicloAtual.estriaAberta.fim.getTime()) / (1000 * 3600 * 24);

              if (jaCompletou && diffDias > 5) {
                cicloAtual.estrias.push(cicloAtual.estriaAberta);
                cicloAtual.estriaAberta = { inicio: dt, fim: dt, qtdTotal: qtd, isHistorico: false };
              } else {
                if (dt > cicloAtual.estriaAberta.fim) cicloAtual.estriaAberta.fim = dt;
                if (dt < cicloAtual.estriaAberta.inicio) cicloAtual.estriaAberta.inicio = dt;
                cicloAtual.estriaAberta.qtdTotal += qtd;
              }
            }
          } else if (isColeta) {
            if (cicloAtual.estriaAberta) {
              cicloAtual.estrias.push(cicloAtual.estriaAberta);
              cicloAtual.estriaAberta = null;
            }
            cicloAtual.totalTambores += qtd;
          }
        });

        if (cicloAtual.estriaAberta) cicloAtual.estrias.push(cicloAtual.estriaAberta);
        if (cicloAtual.estrias.length > 0 || cicloAtual.totalTambores > 0) ciclosQuadra.push(cicloAtual);
        if (ciclosQuadra.length === 0) ciclosQuadra.push(cicloAtual); 

        ciclosQuadra.forEach((c, idx) => {
          const isUltimoCiclo = idx === ciclosQuadra.length - 1;
          
          let proximaEstria = null;
          let diasAtraso = 0;
          let statusTexto = isUltimoCiclo ? 'Aguardando 1º' : 'COLETA FEITA';

          if (isUltimoCiclo && c.estrias.length > 0) {
            const ultima = c.estrias[c.estrias.length - 1];
            const pct = totalPesQuadra > 0 ? (ultima.qtdTotal / totalPesQuadra) : 1;

            if (pct < 0.85 && !ultima.isHistorico) {
              statusTexto = `Fazendo\n${ultima.qtdTotal} / ${totalPesQuadra}`;
            } else {
              // SOMA +15 DIAS NA DATA INICIAL COMO PEDIDO
              const dtInicio = new Date(ultima.inicio);
              const dtProxima = new Date(dtInicio);
              dtProxima.setDate(dtInicio.getDate() + 15);
              proximaEstria = dtProxima.toISOString().split('T')[0];

              const hoje = new Date();
              hoje.setHours(0,0,0,0); dtProxima.setHours(0,0,0,0);

              if (hoje > dtProxima) {
                diasAtraso = Math.ceil(Math.abs(hoje.getTime() - dtProxima.getTime()) / (1000 * 3600 * 24));
                statusTexto = 'ATRASADO';
              } else {
                statusTexto = 'OK';
              }
            }
          }

          let tbsMil = 0;
          let grEstria = 0;

          if (totalPesQuadra > 0) {
            tbsMil = (c.totalTambores / totalPesQuadra) * 1000;
            if (c.estrias.length > 0) {
              grEstria = (c.totalTambores * PESO_TAMBOR_KG * 1000) / (totalPesQuadra * c.estrias.length);
            }
          }

          const formatarDataBr = (dtObj: Date) => {
             const str = dtObj.toISOString().split('T')[0];
             return `${str.split('-')[2]}/${str.split('-')[1]}`;
          };

          const estriasAvaliadas: EstriaInfo[] = c.estrias.map((est: any, eIdx: number) => {
             if (est.isHistorico) {
                const dtStr = est.fim.toISOString().split('T')[0];
                if (dtStr === '2020-01-01') return { texto: 'Feito', isAtrasada: false, diasAtraso: 0 };
                const fmt = `${dtStr.split('-')[2]}/${dtStr.split('-')[1]}`;
                return { texto: `Feito\n${fmt}`, isAtrasada: false, diasAtraso: 0 };
             }

             const ini = formatarDataBr(est.inicio);
             const fim = formatarDataBr(est.fim);
             const textoData = ini === fim ? ini : `${ini} a ${fim}`;

             let isAtrasada = false;
             let diasAtrasoEstria = 0;

             if (eIdx > 0) {
               const dtAnterior = new Date(c.estrias[eIdx - 1].inicio);
               // Ignora cálculo se a estria anterior for a fantasma sem data
               if (dtAnterior.getFullYear() !== 2020) {
                 const dtAtual = new Date(est.inicio);
                 dtAnterior.setHours(0,0,0,0); dtAtual.setHours(0,0,0,0);
                 const diffTime = dtAtual.getTime() - dtAnterior.getTime();
                 const diffDias = Math.ceil(diffTime / (1000 * 3600 * 24));
                 
                 if (diffDias > 15) {
                   isAtrasada = true;
                   diasAtrasoEstria = diffDias - 15;
                 }
               }
             }

             const pct = totalPesQuadra > 0 ? Math.round((est.qtdTotal / totalPesQuadra) * 100) : 100;
             let textoFinal = textoData;
             if (isUltimoCiclo && eIdx === c.estrias.length - 1 && pct < 85) {
                textoFinal = `${textoData}\n(${pct}%)`;
             }

             return { texto: textoFinal, isAtrasada, diasAtraso: diasAtrasoEstria };
          });

          const formatarDataInteira = (dt: string) => {
             const p = dt.split('-');
             return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : dt;
          };

          dadosFinais.push({
            id: `${qdr}-Col${c.num}`,
            quadra_raw: qdr,
            quadra_nome: `Q. ${qdr}`,
            ciclo_num: c.num,
            qtde_arvores: totalPesQuadra,
            estrias: estriasAvaliadas,
            proxima_estria: proximaEstria ? formatarDataInteira(proximaEstria) : null,
            status: statusTexto,
            dias_atraso: diasAtraso,
            total_tambores: c.totalTambores,
            gr_estria: grEstria,
            tbs_mil: tbsMil,
            is_ciclo_fechado: !isUltimoCiclo
          });
        });
      });

      if (coletaSelecionada !== 'Todas') {
         dadosFinais = dadosFinais.filter(d => d.ciclo_num.toString() === coletaSelecionada);
      }

      let arvoresUnicasSomadas = 0;
      let tamboresGeraisSomados = 0;
      let arvoresXestriasFeitas = 0;
      const arvoresContadas = new Set();

      dadosFinais.forEach(linha => {
        if (!arvoresContadas.has(linha.quadra_raw)) {
          arvoresUnicasSomadas += linha.qtde_arvores;
          arvoresContadas.add(linha.quadra_raw);
        }
        tamboresGeraisSomados += linha.total_tambores;
        arvoresXestriasFeitas += (linha.qtde_arvores * linha.estrias.length);
      });

      setTotalArvoresGeral(arvoresUnicasSomadas);
      setTotalTamboresGeral(tamboresGeraisSomados);
      setMediaKgArvore(arvoresUnicasSomadas > 0 ? (tamboresGeraisSomados * PESO_TAMBOR_KG) / arvoresUnicasSomadas : 0);
      setMediaGrEstria(arvoresXestriasFeitas > 0 ? (tamboresGeraisSomados * PESO_TAMBOR_KG * 1000) / arvoresXestriasFeitas : 0);

      setDados(dadosFinais);
    } catch (error: any) {
      console.log('Erro de Processamento:', error);
      Alert.alert('Erro', error.message || 'Ocorreu um erro ao processar os dados.');
    } finally {
      setLoading(false);
    }
  };

  const gerarPDF = async () => {
    if (dados.length === 0) return Alert.alert('Aviso', 'Não há dados para gerar o PDF.');
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
      } catch (err) { console.log(err); }

      let linhasTabela = '';
      dados.forEach(item => {
        const corLinha = item.is_ciclo_fechado ? '#EAEDED' : '#FFFFFF';
        
        const tdsEstrias = Array.from({ length: 10 }).map((_, i) => {
           const e = item.estrias[i];
           if (!e) return `<td>-</td>`;
           const bg = e.isAtrasada ? 'background-color: #FDEDEC; color: #C0392B; font-weight: bold;' : '';
           const txt = e.texto.replace(/\n/g, '<br>');
           const icone = e.isAtrasada ? `<br><span style="font-size: 8px;">(Atraso: ${e.diasAtraso}d)</span>` : '';
           return `<td style="${bg}">${txt}${icone}</td>`;
        }).join('');

        linhasTabela += `
          <tr style="background-color: ${corLinha};">
            <td style="font-weight: bold;">${item.quadra_nome} <br><span style="font-size: 8px; color: #7F8C8D;">${item.ciclo_num}ª Col.</span></td>
            <td style="color: #D35400; font-weight: bold;">${item.qtde_arvores.toLocaleString('pt-BR')}</td>
            ${tdsEstrias}
            <td style="color: #B9770E; font-weight: bold; background-color: #FEF9E7;">${item.proxima_estria || '-'}</td>
            <td style="color: ${item.dias_atraso > 0 ? '#C0392B' : (item.is_ciclo_fechado ? '#7F8C8D' : '#27AE60')}; font-weight: bold; font-size: 8px;">
              ${item.dias_atraso > 0 ? item.dias_atraso + ' d Atraso' : item.status.replace('\n', '<br>')}
            </td>
            <td><strong>${item.total_tambores}</strong></td>
            <td><strong>${item.gr_estria.toFixed(0)}</strong></td>
            <td><strong>${item.tbs_mil.toFixed(2)}</strong></td>
          </tr>
        `;
      });

      const htmlCompleto = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Cronograma de Safra</title>
            <style>
              @page { margin: 10mm; size: A4 landscape; }
              body { font-family: 'Arial', sans-serif; font-size: 9px; color: #333; margin: 0; padding: 0; }
              .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2C3E50; padding-bottom: 10px; margin-bottom: 15px; }
              .header-logo img { max-height: 50px; }
              h1 { margin: 0; font-size: 18px; color: #2C3E50; text-transform: uppercase; }
              .resumo-container { display: flex; justify-content: space-between; background-color: #F8F9F9; padding: 10px; border-radius: 6px; border: 1px solid #BDC3C7; margin-bottom: 10px; }
              .resumo-box { text-align: center; width: 24%; border-right: 1px solid #D5DBDB; }
              .resumo-box:last-child { border-right: none; }
              .resumo-titulo { font-size: 9px; color: #7F8C8D; font-weight: bold; text-transform: uppercase; }
              .resumo-valor { font-size: 14px; font-weight: bold; color: #2980B9; margin-top: 3px; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; text-align: center; }
              th, td { border: 1px solid #BDC3C7; padding: 3px; }
              th { background-color: #2C3E50; color: #FFF; font-size: 8px; text-transform: uppercase; }
            </style>
          </head>
          <body>
            <div class="header-container">
              ${base64Logo ? `<div class="header-logo"><img src="${base64Logo}" /></div>` : ''}
              <div style="text-align: right;">
                <h1>Safra ${safraSelecionada} - ${fazendaSelecionada}</h1>
                <p style="margin: 4px 0 0 0; color: #7F8C8D;">Filtro de Coleta: ${coletaSelecionada === 'Todas' ? 'Histórico Completo' : coletaSelecionada + 'ª Coleta'} | Emitido em: ${new Date().toLocaleDateString('pt-BR')}</p>
              </div>
            </div>

            <div class="resumo-container">
              <div class="resumo-box">
                <div class="resumo-titulo">Total Árvores</div>
                <div class="resumo-valor" style="color: #D35400;">${totalArvoresGeral.toLocaleString('pt-BR')}</div>
              </div>
              <div class="resumo-box">
                <div class="resumo-titulo">Total Tambores</div>
                <div class="resumo-valor" style="color: #27AE60;">${totalTamboresGeral.toLocaleString('pt-BR')}</div>
              </div>
              <div class="resumo-box">
                <div class="resumo-titulo">Média Kg / Árvore</div>
                <div class="resumo-valor">${mediaKgArvore.toFixed(2).replace('.', ',')} kg</div>
              </div>
              <div class="resumo-box">
                <div class="resumo-titulo">Média Gr / Estria</div>
                <div class="resumo-valor">${mediaGrEstria.toFixed(0)} g</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Quadra</th><th>Pés</th>
                  <th>1º</th><th>2º</th><th>3º</th><th>4º</th><th>5º</th>
                  <th>6º</th><th>7º</th><th>8º</th><th>9º</th><th>10º</th>
                  <th style="background-color: #F1C40F; color: #333;">Próx. (+15d)</th>
                  <th>Status</th>
                  <th>Tbs</th><th>Gr/Est</th><th>Tbs/M</th>
                </tr>
              </thead>
              <tbody>${linhasTabela}</tbody>
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
    } catch (err: any) {
      Alert.alert('Erro', 'Ocorreu um problema ao gerar o PDF.');
    } finally {
      setGerandoPdf(false);
    }
  };

  const renderColunasEstria = (estrias: EstriaInfo[]) => {
    let colunas = [];
    for (let i = 0; i < 10; i++) {
      const info = estrias[i];
      const hasData = !!info;
      const incompleta = hasData && info.texto.includes('%');
      const bg = info?.isAtrasada ? '#FDEDEC' : 'transparent';
      const color = info?.isAtrasada ? '#C0392B' : (incompleta ? '#D35400' : '#2C3E50');

      colunas.push(
        <View key={`estria-${i}`} style={[styles.td, { width: 95, justifyContent: 'center', backgroundColor: bg, paddingVertical: 4 }]}>
          {hasData ? (
            <>
              <Text style={{ textAlign: 'center', fontSize: 10, fontWeight: incompleta || info.isAtrasada ? 'bold' : 'normal', color }}>
                {info.isAtrasada ? '⚠️ ' : ''}{info.texto}
              </Text>
              {info.isAtrasada && <Text style={{fontSize: 8, color: '#C0392B', textAlign: 'center', marginTop: 2}}>{info.diasAtraso}d Atraso</Text>}
            </>
          ) : (
             <Text style={{ textAlign: 'center', color: '#2C3E50' }}>-</Text>
          )}
        </View>
      );
    }
    return colunas;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
          <View>
            <Text style={styles.title}>Painel de Safra</Text>
            <Text style={styles.subtitle}>Gestão de prazos e coletas</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardFiltros}>
        <View style={styles.row}>
          <View style={[styles.col, { flex: 1.2, marginRight: 5 }]}>
            <Text style={styles.labelInput}>Fazenda *</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={fazendaSelecionada} onValueChange={setFazendaSelecionada} style={styles.picker}>
                <Picker.Item label="Selecione..." value="" />
                {fazendasDisponiveis.map(f => <Picker.Item key={f} label={f} value={f} />)}
              </Picker>
            </View>
          </View>

          <View style={[styles.col, { flex: 1, marginRight: 5 }]}>
            <Text style={styles.labelInput}>Ano Safra</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={safraSelecionada} onValueChange={setSafraSelecionada} style={styles.picker}>
                {gerarListaSafras().map(s => <Picker.Item key={s} label={s} value={s} />)}
              </Picker>
            </View>
          </View>

          <View style={[styles.col, { flex: 0.8 }]}>
            <Text style={styles.labelInput}>Coleta</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={coletaSelecionada} onValueChange={setColetaSelecionada} style={styles.picker}>
                <Picker.Item label="Todas" value="Todas" />
                {[1, 2, 3, 4, 5, 6].map(c => <Picker.Item key={c} label={`${c}ª`} value={c.toString()} />)}
              </Picker>
            </View>
          </View>
        </View>
        
        <TouchableOpacity style={[styles.btnPdf, gerandoPdf || dados.length === 0 ? styles.btnPdfDisabled : null]} onPress={gerarPDF} disabled={gerandoPdf || dados.length === 0}>
          {gerandoPdf ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.btnPdfText}>🖨️ Exportar Relatório da Safra</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.tabelaContainer}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#2980B9" />
          </View>
        ) : dados.length === 0 && fazendaSelecionada ? (
          <Text style={styles.emptyState}>Nenhum registro para esta Safra/Coleta.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ flexGrow: 1 }}>
            <View style={{ flex: 1, minWidth: '100%' }}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, styles.quadraCell]}>Quadra</Text>
                <Text style={[styles.th, styles.facesCell]}>Qtde Pés</Text>
                {[...Array(10)].map((_, i) => <Text key={`h-${i}`} style={[styles.th, { width: 95 }]}>{i + 1}º Estria</Text>)}
                <Text style={[styles.th, { width: 95, color: '#333', backgroundColor: '#F1C40F' }]}>Próx. (+15d)</Text>
                <Text style={[styles.th, { width: 110 }]}>Status</Text>
                <Text style={[styles.th, styles.extraCellH]}>Tbs</Text>
                <Text style={[styles.th, styles.extraCellH]}>Gr/Est</Text>
                <Text style={[styles.th, styles.extraCellH]}>Tbs/M</Text>
              </View>

              <ScrollView nestedScrollEnabled style={{ flex: 1 }}>
                {dados.map((item, index) => {
                   const corFundo = item.is_ciclo_fechado ? '#EAEDED' : (index % 2 === 0 ? '#FDFEFE' : '#F4F6F6');
                   return (
                    <View key={item.id} style={[styles.tableRow, { backgroundColor: corFundo }]}>
                      
                      {/* BOTÃO PARA ABRIR CONFIGURAÇÃO DA QUADRA */}
                      <TouchableOpacity style={[styles.td, { width: 65, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]} onPress={() => abrirModalInicial(item.quadra_raw)}>
                        <Text style={{ fontWeight: 'bold', color: '#2980B9', fontSize: 13 }}>
                          Q.{item.quadra_raw} ⚙️
                        </Text>
                      </TouchableOpacity>

                      <Text style={[styles.td, { width: 70, color: '#D35400', fontWeight: 'bold' }]}>{item.qtde_arvores.toLocaleString('pt-BR')}</Text>
                      
                      {renderColunasEstria(item.estrias)}
                      
                      <Text style={[styles.td, { width: 95, backgroundColor: '#FEF9E7', fontWeight: 'bold', color: '#B9770E' }]}>{item.proxima_estria || '-'}</Text>
                      
                      <View style={[styles.td, { width: 110, justifyContent: 'center', alignItems: 'center' }]}>
                        {item.dias_atraso > 0 ? (
                          <View style={styles.badgeAtraso}><Text style={styles.badgeTextAtraso}>{item.dias_atraso} d Atraso</Text></View>
                        ) : item.status.includes('Fazendo') ? (
                          <View style={styles.badgeAndamento}><Text style={styles.badgeTextAndamento}>{item.status}</Text></View>
                        ) : item.is_ciclo_fechado ? (
                           <Text style={{color: '#7F8C8D', fontSize: 10, fontWeight: 'bold'}}>COLETA FEITA</Text>
                        ) : (
                          <View style={styles.badgeOk}><Text style={styles.badgeTextOk}>OK</Text></View>
                        )}
                      </View>
                      
                      <Text style={[styles.td, styles.extraCell, {fontWeight: 'bold'}]}>{item.total_tambores}</Text>
                      <Text style={[styles.td, styles.extraCell]}>{item.gr_estria > 0 ? item.gr_estria.toFixed(0) : '-'}</Text>
                      <Text style={[styles.td, styles.extraCell]}>{item.tbs_mil > 0 ? item.tbs_mil.toFixed(2) : '-'}</Text>
                    </View>
                  )
                })}
              </ScrollView>
            </View>
          </ScrollView>
        )}
      </View>

      {!loading && dados.length > 0 && (
        <View style={styles.footerWrap}>
           <View style={styles.footerCol}>
              <Text style={styles.footerLabel}>Total Árvores</Text>
              <Text style={styles.footerValorDestaque}>{totalArvoresGeral.toLocaleString('pt-BR')}</Text>
           </View>
           <View style={styles.footerCol}>
              <Text style={styles.footerLabel}>Total Tambores</Text>
              <Text style={styles.footerValorOk}>{totalTamboresGeral.toLocaleString('pt-BR')}</Text>
           </View>
           <View style={styles.footerCol}>
              <Text style={styles.footerLabel}>Média Kg/Árvore</Text>
              <Text style={styles.footerValor}>{mediaKgArvore.toFixed(2).replace('.', ',')} kg</Text>
           </View>
           <View style={[styles.footerCol, {borderRightWidth: 0}]}>
              <Text style={styles.footerLabel}>Média Gr/Estria</Text>
              <Text style={styles.footerValor}>{mediaGrEstria.toFixed(0)} g</Text>
           </View>
        </View>
      )}

      {/* MODAL CONFIGURAÇÃO DE DADOS INICIAIS */}
      <Modal visible={modalInicialVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Ajustar Histórico: Quadra {quadraEditando}</Text>
            <Text style={styles.modalSubtitle}>Adicione o que já foi feito antes de usar o app nesta safra.</Text>
            
            <View style={{marginTop: 15}}>
              <Text style={styles.labelInput}>Coletas já encerradas nesta safra:</Text>
              <TextInput 
                style={styles.inputModal} 
                keyboardType="numeric" 
                value={formInicial.coletasFeitas} 
                onChangeText={t => setFormInicial({...formInicial, coletasFeitas: t})} 
              />

              <Text style={styles.labelInput}>Estrias já feitas na coleta atual:</Text>
              <TextInput 
                style={styles.inputModal} 
                keyboardType="numeric" 
                value={formInicial.estriasFeitas} 
                onChangeText={t => setFormInicial({...formInicial, estriasFeitas: t})} 
              />

              <Text style={styles.labelInput}>Data da última estria feita (DD/MM/AAAA):</Text>
              <TextInput 
                style={styles.inputModal} 
                keyboardType="numeric" 
                maxLength={10}
                placeholder="Ex: 15/06/2026"
                value={formInicial.dataUltimaEstria} 
                onChangeText={aplicarMascaraData} 
              />

              <Text style={styles.labelInput}>Tambores já colhidos na coleta atual:</Text>
              <TextInput 
                style={styles.inputModal} 
                keyboardType="numeric" 
                value={formInicial.tambores} 
                onChangeText={t => setFormInicial({...formInicial, tambores: t})} 
              />
            </View>

            <View style={{flexDirection: 'row', marginTop: 20}}>
              <TouchableOpacity style={[styles.btnConfigSave, {backgroundColor: '#EAEDED', marginRight: 10}]} onPress={() => setModalInicialVisible(false)}>
                <Text style={{color: '#34495E', fontWeight: 'bold'}}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnConfigSave} onPress={salvarDadosIniciais}>
                <Text style={{color: '#FFF', fontWeight: 'bold'}}>💾 Salvar Histórico</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, paddingTop: 30, backgroundColor: '#FFF', elevation: 2, borderBottomWidth: 1, borderBottomColor: '#E0E6ED' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 13, color: '#7F8C8D', marginTop: 2 },
  cardFiltros: { backgroundColor: '#FFFFFF', padding: 15, margin: 15, borderRadius: 12, elevation: 3 },
  row: { flexDirection: 'row' },
  col: { flex: 1 },
  labelInput: { fontSize: 11, fontWeight: '700', color: '#34495E', marginBottom: 5 },
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', height: 40, justifyContent: 'center' },
  picker: { height: 68, width: '100%', color: '#2C3E50', fontSize: 12 },
  btnPdf: { backgroundColor: '#34495E', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  btnPdfDisabled: { backgroundColor: '#95A5A6' },
  btnPdfText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
  tabelaContainer: { flex: 1, backgroundColor: '#FFF', marginHorizontal: 15, marginBottom: 15, borderRadius: 12, elevation: 3, overflow: 'hidden' },
  emptyState: { textAlign: 'center', marginTop: 40, color: '#95A5A6', fontSize: 15, fontStyle: 'italic' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#2C3E50', paddingVertical: 12, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  th: { color: '#FFF', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 2, textAlign: 'center', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ECF0F1', alignItems: 'center' },
  rowEven: { backgroundColor: '#FDFEFE' },
  rowOdd: { backgroundColor: '#F4F6F6' },
  td: { fontSize: 12, color: '#2C3E50', paddingHorizontal: 2, paddingVertical: 8, textAlign: 'center', borderRightWidth: 1, borderRightColor: '#EAEDED' },
  quadraCell: { width: 65 },
  facesCell: { width: 70 },
  extraCellH: { width: 55, color: '#2ECC71' },
  extraCell: { width: 55, color: '#27AE60' },
  badgeAtraso: { backgroundColor: '#FADBD8', paddingVertical: 4, paddingHorizontal: 2, borderRadius: 4, width: '100%', alignItems: 'center' },
  badgeTextAtraso: { color: '#C0392B', fontWeight: 'bold', fontSize: 10, textAlign: 'center' },
  badgeOk: { backgroundColor: '#D5F5E3', paddingVertical: 4, paddingHorizontal: 4, borderRadius: 4, width: '100%', alignItems: 'center' },
  badgeTextOk: { color: '#27AE60', fontWeight: 'bold', fontSize: 11 },
  badgeAndamento: { backgroundColor: '#EBDEF0', paddingVertical: 4, paddingHorizontal: 2, borderRadius: 4, width: '100%', alignItems: 'center' },
  badgeTextAndamento: { color: '#8E44AD', fontWeight: 'bold', fontSize: 9, textAlign: 'center' },
  footerWrap: { flexDirection: 'row', backgroundColor: '#2C3E50', padding: 15, justifyContent: 'space-between' },
  footerCol: { alignItems: 'center', flex: 1, borderRightWidth: 1, borderRightColor: '#34495E' },
  footerLabel: { color: '#BDC3C7', fontSize: 10, textTransform: 'uppercase', fontWeight: 'bold', marginBottom: 4 },
  footerValor: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  footerValorDestaque: { color: '#E67E22', fontSize: 15, fontWeight: 'bold' },
  footerValorOk: { color: '#2ECC71', fontSize: 15, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContainer: { backgroundColor: '#FFF', borderRadius: 12, padding: 20, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2C3E50' },
  modalSubtitle: { fontSize: 13, color: '#7F8C8D', marginTop: 5 },
  inputModal: { borderWidth: 1, borderColor: '#BDC3C7', borderRadius: 8, padding: 10, marginBottom: 15, backgroundColor: '#F8FAFC' },
  btnConfigSave: { flex: 1, backgroundColor: '#2980B9', padding: 12, borderRadius: 8, alignItems: 'center' }
});