import { Picker } from '@react-native-picker/picker';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

// =========================================================================
// 🟢 BUSCA PAGINADA COM SELECT('*') (Evita erro de colunas inexistentes)
// =========================================================================
const buscarTodasAsLinhas = async (tabela: string) => {
  let todosOsDados: any[] = [];
  const limite = 1000;
  let inicio = 0;
  let buscando = true;

  while (buscando) {
    const { data, error } = await supabase
      .from(tabela)
      .select('*')
      .order('id', { ascending: true })
      .range(inicio, inicio + limite - 1);

    if (error) {
      console.error(`Erro ao buscar ${tabela}:`, error);
      throw error;
    }

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

// 🟢 ARREDONDAMENTO LIMPO (Impede números como 95.00999999999999)
const arredondar = (num: any): number => {
  const n = Number(num) || 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

// 🟢 FORMATAÇÃO VISUAL (Ex: 86.1 vira 86,1 | 1005 vira 1.005)
const formatarQtd = (num: any): string => {
  if (num === '-' || num === '"' || num === null || num === undefined) return String(num || '-');
  const n = arredondar(num);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const normalizarTexto = (txt: any): string => {
  if (!txt) return '';
  return String(txt)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
};

// 🟢 PADRONIZA O NOME DA FAZENDA (Remove "FAZENDA " duplicado e acentos divergentes)
const normalizarNomeFazenda = (nome: any): string => {
  if (!nome) return 'NAO INFORMADA';
  return normalizarTexto(nome)
    .replace(/^FAZENDA\s+/i, '')
    .replace(/^FAZ\.?\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export default function RelatorioCargasScreen() {
  const [fazendaSelecionada, setFazendaSelecionada] = useState('TODAS');
  const [tipoCargaSelecionado, setTipoCargaSelecionado] = useState('TODAS'); 
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
      buscarCargasEProducao();
    }
  }, [dataInicial, dataFinal, fazendaSelecionada, tipoCargaSelecionado]); 

  const aplicarMascaraData = (texto: string, setFunction: React.Dispatch<React.SetStateAction<string>>) => {
    let v = texto.replace(/\D/g, ''); 
    if (v.length > 8) v = v.substring(0, 8); 
    if (v.length > 4) v = v.replace(/^(\d{2})(\d{2})(\d+)/, '$1/$2/$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d+)/, '$1/$2');
    setFunction(v);
  };

  const converterDataParaBanco = (dataBR: string) => {
    if (!dataBR) return null;
    const partes = dataBR.split('/');
    if (partes.length === 3) return `${partes[2]}-${partes[1]}-${partes[0]}`;
    return null;
  };

  const extrairDataLocal = (dt: string) => {
    if (!dt) return null;
    const limpa = String(dt).trim();
    if (limpa.includes('/')) {
      const parts = limpa.split(' ')[0].split('/');
      if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return limpa.substring(0, 10);
  };

  const carregarFazendas = async () => {
    const { data } = await supabase.from('mapa_fazendas').select('fazenda');
    if (data) {
      const unicas = [...new Set(data.map(item => normalizarNomeFazenda(item.fazenda)).filter(Boolean))].sort();
      setListaFazendas(unicas as string[]);
    }
  };

  const buscarCargasEProducao = async () => {
    const dataIniBD = converterDataParaBanco(dataInicial);
    const dataFimBD = converterDataParaBanco(dataFinal);
    
    if (!dataIniBD || !dataFimBD) return;

    setCarregando(true);
    try {
      // 1️⃣ BUSCA PAGINADA COMPLETA DE TODAS AS TABELAS USANDO '*'
      const [
        todosCarregamentos,
        todosDiarios,
        todosEstoqueAnt,
        todasBaixas
      ] = await Promise.all([
        buscarTodasAsLinhas('carregamentos'),
        buscarTodasAsLinhas('diarios_campo'),
        buscarTodasAsLinhas('estoque_anterior'),
        buscarTodasAsLinhas('baixas_estoque')
      ]);

      const fazendaFiltroNorm = fazendaSelecionada !== 'TODAS' ? normalizarNomeFazenda(fazendaSelecionada) : 'TODAS';

      // 2️⃣ CÁLCULO DO ESTOQUE ANTERIOR (Tudo antes de dataIniBD) + BAIXAS DO PERÍODO
      const saldoInicialPorFazenda: Record<string, number> = {};
      const baixasPorFazendaDia: Record<string, Record<string, number>> = {};

      todosEstoqueAnt.forEach(item => {
        const f = normalizarNomeFazenda(item.fazenda);
        if (fazendaFiltroNorm !== 'TODAS' && f !== fazendaFiltroNorm) return;
        saldoInicialPorFazenda[f] = arredondar((saldoInicialPorFazenda[f] || 0) + (Number(item.quantidade) || 0));
      });

      todasBaixas.forEach(item => {
        const f = normalizarNomeFazenda(item.fazenda);
        if (fazendaFiltroNorm !== 'TODAS' && f !== fazendaFiltroNorm) return;
        const dt = extrairDataLocal(item.created_at || item.data);
        const qtd = arredondar(item.quantidade);

        if (dt && dt < dataIniBD) {
          saldoInicialPorFazenda[f] = arredondar((saldoInicialPorFazenda[f] || 0) - qtd);
        } else if (dt && dt >= dataIniBD && dt <= dataFimBD) {
          if (!baixasPorFazendaDia[f]) baixasPorFazendaDia[f] = {};
          baixasPorFazendaDia[f][dt] = arredondar((baixasPorFazendaDia[f][dt] || 0) + qtd);
        }
      });

      // 3️⃣ SEPARA DIÁRIOS E CARGAS ENTRE PASSADO (< dataIniBD) E PERÍODO ATUAL
      const mapaFazendas: any = {};

      todosDiarios.forEach(d => {
        const f = normalizarNomeFazenda(d.fazenda);
        if (fazendaFiltroNorm !== 'TODAS' && f !== fazendaFiltroNorm) return;

        const srv = normalizarTexto(d.servico);
        const colab = normalizarTexto(d.colaborador);
        const isColeta = srv.includes('COLETA') && !srv.includes('PREPARO') && !srv.includes('LIMPEZA');
        const isRemocao = srv.includes('REMO') || colab.includes('REMOCAO');

        if (!isColeta && !isRemocao) return;

        const dt = extrairDataLocal(d.data || d.created_at);
        if (!dt) return;

        const qtd = arredondar(d.quantidade);

        if (dt < dataIniBD) {
          if (isColeta) {
            saldoInicialPorFazenda[f] = arredondar((saldoInicialPorFazenda[f] || 0) + qtd);
          }
        } else if (dt >= dataIniBD && dt <= dataFimBD) {
          if (!mapaFazendas[f]) mapaFazendas[f] = {};
          if (!mapaFazendas[f][dt]) mapaFazendas[f][dt] = { quadras: new Set<string>(), totalColeta: 0, totalRemocao: 0, cargas: [] };

          // 🟢 DESMEMBRA QUADRAS (Impede textos duplicados como "11, 17, 20 / 11 / 17 / 20")
          if (d.quadra && String(d.quadra).trim() !== '-') {
            String(d.quadra)
              .split(/[,/]+/)
              .map(q => q.trim())
              .filter(q => q && q !== '-')
              .forEach(q => mapaFazendas[f][dt].quadras.add(q));
          }

          if (isColeta && qtd > 0) {
            mapaFazendas[f][dt].totalColeta = arredondar(mapaFazendas[f][dt].totalColeta + qtd);
          }
          if (isRemocao && qtd > 0) {
            mapaFazendas[f][dt].totalRemocao = arredondar(mapaFazendas[f][dt].totalRemocao + qtd);
          }
        }
      });

      todosCarregamentos.forEach(c => {
        const f = normalizarNomeFazenda(c.fazenda);
        if (fazendaFiltroNorm !== 'TODAS' && f !== fazendaFiltroNorm) return;

        const dt = extrairDataLocal(c.data_saida || c.data || c.created_at);
        if (!dt) return;

        const isMadeira = normalizarTexto(c.tipo_carga).includes('MADEIRA');
        const qtd = arredondar(c.quantidade);

        if (dt < dataIniBD) {
          if (!isMadeira) {
            saldoInicialPorFazenda[f] = arredondar((saldoInicialPorFazenda[f] || 0) - qtd);
          }
        } else if (dt >= dataIniBD && dt <= dataFimBD) {
          if (tipoCargaSelecionado !== 'TODAS' && c.tipo_carga !== tipoCargaSelecionado) return;

          if (!mapaFazendas[f]) mapaFazendas[f] = {};
          if (!mapaFazendas[f][dt]) mapaFazendas[f][dt] = { quadras: new Set<string>(), totalColeta: 0, totalRemocao: 0, cargas: [] };

          mapaFazendas[f][dt].cargas.push(c);
        }
      });

      // 4️⃣ GERA A LISTA CRONOLÓGICA COM SALDO ARREDONDADO E QUADRAS LIMPAS
      const agrupamento: any = {};
      let tPeso = 0; let tTambores = 0; let tCargas = 0; let tVolume = 0;

      Object.keys(mapaFazendas).forEach(faz => {
        agrupamento[faz] = { 
          linhas: [], 
          total_peso: 0, 
          total_tambores: 0, 
          total_volume: 0, 
          total_coleta: 0,
          total_remocao: 0,
          saldo_inicial: arredondar(saldoInicialPorFazenda[faz] || 0)
        };
        
        let saldoAtual = arredondar(saldoInicialPorFazenda[faz] || 0);
        const datas = Object.keys(mapaFazendas[faz]).sort();

        datas.forEach(dt => {
          const diaInfo = mapaFazendas[faz][dt];
          
          const quadrasOrdenadas = Array.from(diaInfo.quadras as Set<string>).sort((a, b) => 
            a.localeCompare(b, undefined, { numeric: true })
          );
          const quadraStr = quadrasOrdenadas.length > 0 ? quadrasOrdenadas.join(' / ') : '-';
          
          const coletaVal = arredondar(diaInfo.totalColeta);
          const remocaoVal = arredondar(diaInfo.totalRemocao);
          const baixaDia = baixasPorFazendaDia[faz]?.[dt] || 0;

          const coletaStr = coletaVal > 0 ? formatarQtd(coletaVal) : '-';
          const remocaoStr = remocaoVal > 0 ? formatarQtd(remocaoVal) : '-';

          saldoAtual = arredondar(saldoAtual + coletaVal - baixaDia);
          agrupamento[faz].total_coleta = arredondar(agrupamento[faz].total_coleta + coletaVal);
          agrupamento[faz].total_remocao = arredondar(agrupamento[faz].total_remocao + remocaoVal);

          if (diaInfo.cargas.length === 0) {
            agrupamento[faz].linhas.push({
              data: dt,
              quadra: quadraStr,
              coleta: coletaStr,
              remocao: remocaoStr,
              carregamento_qtd: '-',
              estoque: formatarQtd(saldoAtual < 0 ? 0 : Math.round(saldoAtual)),
              romaneio: '-',
              tipo_carga: '-',
              variedade: '-',
              peso: 0,
              tambores: 0,
              volume: 0,
              media_tambor: 0
            });
          } else {
            diaInfo.cargas.forEach((c: any, index: number) => {
              const isMadeira = normalizarTexto(c.tipo_carga).includes('MADEIRA');
              const peso = arredondar(c.peso_liquido || c.peso || 0);
              const tambores = isMadeira ? 0 : arredondar(c.quantidade || 0);
              const volume = arredondar(c.madeira_volume || 0);

              saldoAtual = arredondar(saldoAtual - tambores);
              const estoqueExibicao = saldoAtual < 0 ? 0 : Math.round(saldoAtual);

              agrupamento[faz].linhas.push({
                data: dt,
                quadra: index === 0 ? quadraStr : '"',
                coleta: index === 0 ? coletaStr : '"', 
                remocao: index === 0 ? remocaoStr : '"',
                carregamento_qtd: isMadeira ? '-' : (tambores > 0 ? formatarQtd(tambores) : '-'),
                estoque: isMadeira ? '-' : formatarQtd(estoqueExibicao),
                romaneio: c.numero_romaneio || c.romaneio || '-',
                tipo_carga: c.tipo_carga || 'Goma Resina',
                variedade: c.variedade || '-',
                peso: peso,
                tambores: tambores,
                volume: volume,
                media_tambor: tambores > 0 ? arredondar(peso / tambores) : 0
              });

              agrupamento[faz].total_peso = arredondar(agrupamento[faz].total_peso + peso);
              agrupamento[faz].total_tambores = arredondar(agrupamento[faz].total_tambores + tambores);
              agrupamento[faz].total_volume = arredondar(agrupamento[faz].total_volume + volume);
              
              tPeso = arredondar(tPeso + peso);
              tTambores = arredondar(tTambores + tambores);
              tVolume = arredondar(tVolume + volume);
              tCargas++;
            });
          }
        });
      });

      setDadosAgrupados(agrupamento);
      setTotalPesoGeral(tPeso);
      setTotalTamboresGeral(tTambores);
      setTotalCargasGeral(tCargas);
      setTotalVolumeGeral(tVolume);

    } catch (err: any) {
      Alert.alert('Detalhe do Erro', err.message);
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

        const linhasComCarga = dados.linhas.filter((c: any) => c.tipo_carga !== '-' && !normalizarTexto(c.tipo_carga).includes('MADEIRA'));
        const totalPesoResina = linhasComCarga.reduce((acc: number, curr: any) => acc + curr.peso, 0);
        const mediaCarga = linhasComCarga.length > 0 ? (totalPesoResina / linhasComCarga.length) : 0;

        let linhasTabela = '';
        dados.linhas.forEach((c: any) => {
          const dtBr = c.data !== '-' ? `${c.data.split('-')[2]}/${c.data.split('-')[1]}/${c.data.split('-')[0]}` : '-';
          const isMadeira = normalizarTexto(c.tipo_carga).includes('MADEIRA');
          const isVazio = c.tipo_carga === '-';
            
          const infoTotal = isVazio 
            ? `<td>-</td>` 
            : (isMadeira 
                ? `<td style="color: #8E44AD; font-weight: bold;">${c.volume.toFixed(2).replace('.', ',')} st</td>`
                : `<td style="color: #E67E22; font-weight: bold;">${c.peso > 0 ? `${c.peso.toLocaleString('pt-BR')} kg` : '-'}</td>`);

          linhasTabela += `
            <tr>
              <td>${c.quadra === '"' ? '"' : dtBr}</td>
              <td style="font-weight: bold;">${c.quadra}</td>
              <td style="font-weight: bold; color: #2980B9;">${c.coleta}</td>
              <td style="font-weight: bold; color: #8E44AD;">${c.remocao}</td>
              <td style="font-weight: bold; color: #E67E22;">${c.carregamento_qtd}</td>
              <td style="font-weight: bold; color: #27AE60;">${c.estoque}</td>
              <td style="color: #2C3E50;">${c.romaneio}</td>
              ${infoTotal}
            </tr>
          `;
        });

        htmlBlocosFazenda += `
          <div class="fazenda-container">
            <div class="fazenda-header">
              <h2>📍 FAZENDA ${fazenda}</h2>
              <div class="fazenda-resumo">
                <span><strong>Saldo Inicial:</strong> ${formatarQtd(dados.saldo_inicial)}</span> | 
                <span><strong>Tot. Coleta:</strong> <span style="color:#2980B9;">${formatarQtd(dados.total_coleta)}</span></span> | 
                <span><strong>Tot. Remoção:</strong> <span style="color:#8E44AD;">${formatarQtd(dados.total_remocao)}</span></span> | 
                <span><strong>Cargas:</strong> ${linhasComCarga.length}</span> | 
                <span><strong>Tambores Exp:</strong> ${formatarQtd(dados.total_tambores)}</span> | 
                <span><strong>Peso Exp:</strong> <span style="color:#27AE60;">${dados.total_peso.toLocaleString('pt-BR')} kg</span></span> | 
                <span><strong>Média/Carga:</strong> ${mediaCarga.toFixed(2).replace('.', ',')} kg</span>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width:11%">Data</th>
                  <th style="width:14%">Quadra</th>
                  <th style="width:10%">Coleta</th>
                  <th style="width:10%">Remoção</th>
                  <th style="width:13%">Carregamento</th>
                  <th style="width:10%">Estoque</th>
                  <th style="width:15%">Nº Romaneio</th>
                  <th style="width:17%">Tot (Kg/st)</th>
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
                <h1>Controle Diário - Operações e Cargas</h1>
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
                <div class="resumo-global-titulo">Tambores Exp.</div>
                <div class="resumo-global-valor">${formatarQtd(totalTamboresGeral)}</div>
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
                <div class="resumo-global-valor" style="color: #9B59B6;">${totalVolumeGeral.toFixed(2).replace('.', ',')} st</div>
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
        <Text style={styles.title}>Diário de Cargas 🚛</Text>
        <Text style={styles.subtitle}>Controle Cronológico - Coleta, Remoção e Exportação</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        <View style={styles.cardFiltros}>
          
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
              <Text style={styles.label}>Tipo Registro:</Text>
              <View style={styles.pickerContainer}>
                <Picker 
                  selectedValue={tipoCargaSelecionado} 
                  onValueChange={setTipoCargaSelecionado} 
                  style={styles.picker}
                >
                  <Picker.Item label="Todos" value="TODAS" />
                  <Picker.Item label="Goma Resina" value="Goma Resina" />
                  <Picker.Item label="Madeira" value="Madeira" />
                </Picker>
              </View>
            </View>
          </View>

          <View style={styles.resumoContainer}>
            <View style={styles.resumoBox}>
              <Text style={styles.resumoTitulo}>Total Cargas</Text>
              <Text style={styles.resumoValorAzul}>{totalCargasGeral}</Text>
            </View>
            <View style={styles.resumoBox}>
              <Text style={styles.resumoTitulo}>Total Tambores</Text>
              <Text style={styles.resumoValorLaranja}>{formatarQtd(totalTamboresGeral)}</Text>
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
                {totalVolumeGeral.toFixed(2).replace('.', ',')} st
              </Text>
            </View>
          </View>

          <TouchableOpacity 
            style={[styles.btnPdf, gerandoPdf || Object.keys(dadosAgrupados).length === 0 ? styles.btnPdfDisabled : null]} 
            onPress={gerarPDF} 
            disabled={gerandoPdf || Object.keys(dadosAgrupados).length === 0}
          >
            {gerandoPdf ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.btnPdfText}>🖨️ Exportar Diário em PDF</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.listaContainer}>
          {carregando ? (
            <ActivityIndicator size="large" color="#2980B9" style={{ marginVertical: 40 }} />
          ) : Object.keys(dadosAgrupados).length === 0 ? (
            <Text style={styles.emptyState}>Nenhum registro encontrado neste período.</Text>
          ) : (
            Object.keys(dadosAgrupados).sort().map(fazenda => {
              const dados = dadosAgrupados[fazenda];
              
              const linhasComCarga = dados.linhas.filter((c: any) => c.tipo_carga !== '-' && !normalizarTexto(c.tipo_carga).includes('MADEIRA'));
              const mediaFazenda = linhasComCarga.length > 0 ? (linhasComCarga.reduce((acc: number, curr: any) => acc + curr.peso, 0) / linhasComCarga.length) : 0;

              return (
                <View key={fazenda} style={styles.cardFazenda}>
                  
                  <View style={styles.headerFazenda}>
                    <Text style={styles.tituloFazenda}>📍 FAZENDA {fazenda}</Text>
                    <View style={styles.tagsFazendaContainer}>
                      <View style={[styles.tagFazenda, { borderColor: '#7F8C8D' }]}>
                        <Text style={[styles.tagTextoFazenda, { color: '#7F8C8D' }]}>Saldo Ant: {formatarQtd(dados.saldo_inicial)}</Text>
                      </View>
                      {dados.total_coleta > 0 && (
                        <View style={[styles.tagFazenda, { borderColor: '#2980B9', backgroundColor: '#EBF5FB' }]}>
                          <Text style={[styles.tagTextoFazenda, { color: '#2980B9' }]}>{formatarQtd(dados.total_coleta)} Coletas</Text>
                        </View>
                      )}
                      {dados.total_remocao > 0 && (
                        <View style={[styles.tagFazenda, { borderColor: '#8E44AD', backgroundColor: '#F5EEF8' }]}>
                          <Text style={[styles.tagTextoFazenda, { color: '#8E44AD' }]}>{formatarQtd(dados.total_remocao)} Removidos</Text>
                        </View>
                      )}
                      {linhasComCarga.length > 0 && (
                        <View style={styles.tagFazenda}>
                          <Text style={styles.tagTextoFazenda}>{linhasComCarga.length} Cargas</Text>
                        </View>
                      )}
                      {dados.total_tambores > 0 && (
                        <View style={[styles.tagFazenda, { borderColor: '#E67E22', backgroundColor: '#FEF5E7' }]}>
                          <Text style={[styles.tagTextoFazenda, { color: '#D35400' }]}>{formatarQtd(dados.total_tambores)} Tbs Exp.</Text>
                        </View>
                      )}
                      {dados.total_peso > 0 && (
                        <View style={[styles.tagFazenda, { backgroundColor: '#27AE60' }]}>
                          <Text style={[styles.tagTextoFazenda, { color: '#FFF' }]}>{dados.total_peso.toLocaleString('pt-BR')} KG</Text>
                        </View>
                      )}
                      {dados.total_volume > 0 && (
                        <View style={[styles.tagFazenda, { backgroundColor: '#8E44AD' }]}>
                          <Text style={[styles.tagTextoFazenda, { color: '#FFF' }]}>{dados.total_volume.toFixed(2).replace('.', ',')} st</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                    <View style={{ minWidth: 680 }}> 
                      <View style={styles.tableHeader}>
                        <Text style={[styles.th, { width: 80 }]}>Data</Text>
                        <Text style={[styles.th, { width: 85, textAlign: 'center' }]}>Quadra</Text>
                        <Text style={[styles.th, { width: 65, textAlign: 'center' }]}>Coleta</Text>
                        <Text style={[styles.th, { width: 70, textAlign: 'center' }]}>Remoção</Text>
                        <Text style={[styles.th, { width: 75, textAlign: 'center' }]}>Carregam.</Text>
                        <Text style={[styles.th, { width: 65, textAlign: 'center' }]}>Estoque</Text>
                        <Text style={[styles.th, { width: 80, textAlign: 'center' }]}>Nº Roman.</Text>
                        <Text style={[styles.th, { width: 85, textAlign: 'center' }]}>Tot (Kg/st)</Text>
                      </View>

                      {dados.linhas.map((c: any, index: number) => {
                        const dtBr = c.data !== '-' ? `${c.data.split('-')[2]}/${c.data.split('-')[1]}/${c.data.split('-')[0]}` : '-';
                        const isMadeira = normalizarTexto(c.tipo_carga).includes('MADEIRA');
                        const isVazio = c.tipo_carga === '-';

                        return (
                          <View key={index} style={[styles.tableRow, index % 2 === 0 ? styles.rowEven : styles.rowOdd]}>
                            <Text style={[styles.td, { width: 80 }]}>{c.quadra === '"' ? '"' : dtBr}</Text>
                            
                            <Text style={[styles.td, { width: 85, textAlign: 'center', fontWeight: 'bold', fontSize: 11 }]} numberOfLines={2}>{c.quadra}</Text>
                            <Text style={[styles.td, { width: 65, textAlign: 'center', color: '#2980B9', fontWeight: 'bold', fontSize: 11 }]}>{c.coleta}</Text>
                            <Text style={[styles.td, { width: 70, textAlign: 'center', color: '#8E44AD', fontWeight: 'bold', fontSize: 11 }]}>{c.remocao}</Text>
                            
                            <Text style={[styles.td, { width: 75, textAlign: 'center', fontWeight: 'bold', color: isVazio ? '#95A5A6' : '#E67E22' }]}>
                              {c.carregamento_qtd}
                            </Text>

                            <Text style={[styles.td, { width: 65, textAlign: 'center', fontWeight: 'bold', fontSize: 12, color: c.estoque === '-' ? '#95A5A6' : '#27AE60' }]}>
                              {c.estoque}
                            </Text>

                            <Text style={[styles.td, { width: 80, textAlign: 'center', fontWeight: 'bold', color: isVazio ? '#95A5A6' : '#2C3E50' }]} numberOfLines={2}>{c.romaneio}</Text>
                            
                            <Text style={[styles.td, { width: 85, textAlign: 'center', fontWeight: 'bold', color: isVazio ? '#95A5A6' : (isMadeira ? '#8E44AD' : '#34495E') }]}>
                              {isVazio ? '-' : (isMadeira ? `${c.volume.toFixed(2).replace('.', ',')} st` : (c.peso > 0 ? `${c.peso.toLocaleString('pt-BR')} kg` : '-'))}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                  
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
  tagsFazendaContainer: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tagFazenda: { backgroundColor: '#F4F6F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: '#E0E6ED' },
  tagTextoFazenda: { fontSize: 10, fontWeight: 'bold', color: '#34495E' },
  
  tableHeader: { flexDirection: 'row', backgroundColor: '#ECF0F1', paddingVertical: 10 },
  th: { color: '#2C3E50', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 8, textTransform: 'uppercase' },
  
  tableRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F2F4F4', alignItems: 'center' },
  rowEven: { backgroundColor: '#FFFFFF' },
  rowOdd: { backgroundColor: '#FAFCFC' },
  td: { fontSize: 11, color: '#34495E', paddingHorizontal: 8 },
  
  footerFazenda: { padding: 10, backgroundColor: '#FDFEFE', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: '#EAEDED' },
  textoFooterFazenda: { fontSize: 11, color: '#7F8C8D' }
});