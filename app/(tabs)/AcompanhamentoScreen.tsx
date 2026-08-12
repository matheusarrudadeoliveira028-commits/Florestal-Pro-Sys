import { Picker } from '@react-native-picker/picker';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

// 👉 ALGORITMO OFFLINE DE FERIADOS NACIONAIS
const obterFeriadosNacionais = (ano: number) => {
  const feriados = [
    '01/01', '21/04', '01/05', '07/09', '12/10', '02/11', '15/11', '20/11', '25/12'
  ];

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

  feriados.push(formatar(addDias(pascoa, -47))); 
  feriados.push(formatar(addDias(pascoa, -2)));  
  feriados.push(formatar(addDias(pascoa, 60)));  

  return feriados.map(dMes => `${ano}-${dMes.split('/')[1]}-${dMes.split('/')[0]}`);
};

export default function AcompanhamentoScreen() {
  const [fiscalSelecionado, setFiscalSelecionado] = useState('TODOS'); 
  const [listaFiscais, setListaFiscais] = useState<{id: string, nome: string}[]>([]);
  const [dataSelecionada, setDataSelecionada] = useState('');
  const [registros, setRegistros] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  
  // 🟢 ESTADOS DO PERFIL
  const [perfilUsuario, setPerfilUsuario] = useState('ADMIN'); 
  const [nomeUsuarioLogado, setNomeUsuarioLogado] = useState('');
  const [idUsuarioLogado, setIdUsuarioLogado] = useState('');
  const [carregandoPerfil, setCarregandoPerfil] = useState(true);

  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [gerandoPdfResumo, setGerandoPdfResumo] = useState(false);

  // Totais do dia
  const [totalQtd, setTotalQtd] = useState(0);
  const [totalValor, setTotalValor] = useState(0);
  const [totalFaltas, setTotalFaltas] = useState(0);
  const [totalAtestados, setTotalAtestados] = useState(0);
  const [equipeTamanho, setEquipeTamanho] = useState(0); 

  // Listas de Nomes
  const [nomesFaltas, setNomesFaltas] = useState<string[]>([]);
  const [nomesAtestados, setNomesAtestados] = useState<string[]>([]);

  // Resumo Hierárquico
  const [resumoHierarquico, setResumoHierarquico] = useState<any>({});
  const [mostrarResumoServicos, setMostrarResumoServicos] = useState(false);

  useEffect(() => {
    const inicializar = async () => {
      await carregarFiscais();
      await carregarPerfilUsuario();
    };

    const hoje = new Date();
    const dia = String(hoje.getDate()).padStart(2, '0');
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const ano = hoje.getFullYear();
    setDataSelecionada(`${dia}/${mes}/${ano}`);
    
    inicializar();
  }, []);

  useEffect(() => {
    if (dataSelecionada.length === 10 && !carregandoPerfil) {
      buscarProducaoDoDia();
    }
  }, [dataSelecionada, fiscalSelecionado, perfilUsuario]);

  const aplicarMascaraData = (texto: string) => {
    let valorSujo = texto.replace(/\D/g, ''); 
    if (valorSujo.length > 8) valorSujo = valorSujo.substring(0, 8); 

    if (valorSujo.length > 4) {
      valorSujo = valorSujo.replace(/^(\d{2})(\d{2})(\d+)/, '$1/$2/$3');
    } else if (valorSujo.length > 2) {
      valorSujo = valorSujo.replace(/^(\d{2})(\d+)/, '$1/$2');
    }

    setDataSelecionada(valorSujo);
  };

  const carregarPerfilUsuario = async () => {
    setCarregandoPerfil(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      setIdUsuarioLogado(user.id);
      const { data: usuarioData } = await supabase
        .from('perfis') 
        .select('cargo, nome')
        .eq('id', user.id) 
        .single();

      if (usuarioData) {
        setPerfilUsuario(usuarioData.cargo);
        setNomeUsuarioLogado(usuarioData.nome);

        // 🟢 Se for Fiscal, trava o estado automaticamente nele
        if (usuarioData.cargo === 'Fiscal de Campo') {
          setFiscalSelecionado(user.id);
        }
      }
    }
    setCarregandoPerfil(false);
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
      // 🟢 DEFINE QUEM É O FISCAL COM BASE NO PERFIL
      let fiscalNomeQuery = '';
      let fiscalIdQuery = 'TODOS';

      if (perfilUsuario === 'Fiscal de Campo') {
        fiscalNomeQuery = nomeUsuarioLogado;
        fiscalIdQuery = idUsuarioLogado;
      } else {
        fiscalIdQuery = fiscalSelecionado;
        if (fiscalSelecionado !== 'TODOS') {
          const fObj = listaFiscais.find(f => f.id === fiscalSelecionado);
          if (fObj) fiscalNomeQuery = fObj.nome;
        }
      }

      // 1. BUSCA DIÁRIOS DE CAMPO
      let queryProd = supabase
        .from('diarios_campo')
        .select('*')
        .gte('data', `${dataBD} 00:00:00`)
        .lte('data', `${dataBD} 23:59:59`)
        .order('colaborador', { ascending: true });

      if (fiscalIdQuery !== 'TODOS') {
        queryProd = queryProd.eq('fiscal_nome', fiscalNomeQuery);
      }
      
      const { data, error } = await queryProd;
      if (error) throw error;

      // 2. BUSCA O TAMANHO DA EQUIPE VINCULADA
      let queryEquipe = supabase.from('colaboradores').select('nome');
      if (fiscalIdQuery !== 'TODOS') {
        queryEquipe = queryEquipe.eq('fiscal_id', fiscalIdQuery);
      }
      const { data: equipeData } = await queryEquipe;

      // =========================================================
      // MATEMÁTICA DE FALTA AUTOMÁTICA E MAPEAMENTO DOS NOMES
      // =========================================================
      const totalAtivos = equipeData ? equipeData.length : 0;
      setEquipeTamanho(totalAtivos);

      const produtoresUnicos = new Set<string>();
      const atestadosUnicos = new Set<string>();

      if (data) {
        data.forEach(d => {
          const srv = String(d.servico || '').toUpperCase();
          if (srv.includes('ATESTADO') || srv.includes('ABONADO')) {
            if (d.colaborador) atestadosUnicos.add(String(d.colaborador).trim().toUpperCase());
          } else {
            if (d.colaborador) produtoresUnicos.add(String(d.colaborador).trim().toUpperCase());
          }
        });
      }

      const equipeNomes = equipeData ? equipeData.map(e => String(e.nome).trim().toUpperCase()) : [];
      const quemProduziu = Array.from(produtoresUnicos);
      const quemAtestado = Array.from(atestadosUnicos);

      const faltantes = equipeNomes.filter(nome => !quemProduziu.includes(nome) && !quemAtestado.includes(nome));

      setNomesFaltas(faltantes.sort());
      setNomesAtestados(quemAtestado.sort());
      setTotalFaltas(faltantes.length);
      setTotalAtestados(quemAtestado.length);

      // =========================================================
      // PROCESSAMENTO DA TABELA E RESUMO
      // =========================================================
      if (data) {
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

        const dadosUnificados = Object.values(registrosAgrupados).map((item: any) => {
          const ramaisUnicos = [...new Set(item.ramais)];
          return {
            ...item,
            ramal: ramaisUnicos.join(', ') || '-'
          };
        });

        dadosUnificados.sort((a: any, b: any) => a.colaborador.localeCompare(b.colaborador));
        setRegistros(dadosUnificados);
        
        const sumQtd = dadosUnificados.reduce((acc, item: any) => acc + (Number(item.quantidade) || 0), 0);
        const sumValor = dadosUnificados.reduce((acc, item: any) => acc + (Number(item.valor_total) || 0), 0);
        setTotalQtd(sumQtd);
        setTotalValor(sumValor);

        const hierarquia = data.reduce((acc: any, item: any) => {
          const s = item.servico || '-';
          const f = item.fazenda || '-';
          const q = item.quadra || '-';
          const r = item.ramal || '-';
          const qtd = Number(item.quantidade) || 0;

          if (!acc[s]) acc[s] = { total: 0, fazendas: {} };
          acc[s].total += qtd;

          if (!acc[s].fazendas[f]) acc[s].fazendas[f] = { total: 0, quadras: {} };
          acc[s].fazendas[f].total += qtd;

          if (!acc[s].fazendas[f].quadras[q]) acc[s].fazendas[f].quadras[q] = { total: 0, ramais: {} };
          acc[s].fazendas[f].quadras[q].total += qtd;

          if (!acc[s].fazendas[f].quadras[q].ramais[r]) acc[s].fazendas[f].quadras[q].ramais[r] = 0;
          acc[s].fazendas[f].quadras[q].ramais[r] += qtd;

          return acc;
        }, {});

        setResumoHierarquico(hierarquia);

      } else {
        setRegistros([]);
        setTotalQtd(0);
        setTotalValor(0);
        setResumoHierarquico({});
      }
    } catch (err: any) {
      Alert.alert('Erro', 'Não foi possível carregar os dados do dia.');
      console.log(err);
    } finally {
      setCarregando(false);
    }
  };

  const converterLogoParaBase64 = async () => {
    let base64Logo = '';
    try {
      const asset = Asset.fromModule(require('../../assets/images/logo.png'));
      await asset.downloadAsync();
      
      if (Platform.OS === 'web') {
        base64Logo = asset.uri;
      } else {
        let uriDaImagem = asset.localUri || asset.uri;
        if (uriDaImagem.startsWith('http')) {
          const { uri } = await FileSystem.downloadAsync(uriDaImagem, FileSystem.cacheDirectory + 'logo_temp_pdf.png');
          uriDaImagem = uri;
        }
        const base64 = await FileSystem.readAsStringAsync(uriDaImagem, { encoding: FileSystem.EncodingType.Base64 });
        base64Logo = `data:image/png;base64,${base64}`;
      }
    } catch (imgErr) {
      console.warn("Aviso: Não foi possível carregar a logo para o PDF.", imgErr);
    }
    return base64Logo;
  };

  const imprimirOuCompartilharPDF = async (htmlContent: string) => {
    if (Platform.OS === 'web') {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute'; iframe.style.width = '0px'; iframe.style.height = '0px'; iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(htmlContent);
        doc.close();
      }

      setTimeout(() => {
        if (iframe.contentWindow) {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        }
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 500);

    } else {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    }
  };

  const gerarPDFPrincipal = async () => {
    if (registros.length === 0) return Alert.alert('Aviso', 'Não há registros para gerar o PDF neste dia.');
    setGerandoPdf(true);

    let nomeDaEquipePdf = 'Todas Equipes';
    if (perfilUsuario === 'Fiscal de Campo') {
      nomeDaEquipePdf = nomeUsuarioLogado;
    } else if (fiscalSelecionado !== 'TODOS') {
      const fObj = listaFiscais.find(f => f.id === fiscalSelecionado);
      if (fObj) nomeDaEquipePdf = fObj.nome;
    }

    try {
      const base64Logo = await converterLogoParaBase64();

      let linhasTabela = '';
      registros.forEach((item: any) => {
        const valorUni = item.valor_unitario ? Number(item.valor_unitario).toFixed(4).replace('.', ',') : '0,00';
        const valorTot = item.valor_total ? Number(item.valor_total).toFixed(2).replace('.', ',') : '0,00';
        linhasTabela += `<tr><td style="text-align: left; font-weight: bold;">${item.colaborador}</td><td style="text-align: left;">${item.servico || '-'}</td><td>${item.quadra || '-'}</td><td>${item.ramal || '-'}</td><td><strong>${item.quantidade || '0'}</strong></td><td>R$ ${valorUni}</td><td style="color: #27AE60;"><strong>R$ ${valorTot}</strong></td></tr>`;
      });

      const htmlCompleto = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Relatório Diário de Produção</title>
            <style>
              @page { margin: 15mm; size: A4 portrait; }
              body { font-family: 'Arial', sans-serif; font-size: 11px; color: #333; margin: 0; padding: 0; }
              .header-container { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #2C3E50; padding-bottom: 15px; }
              .header-logo img { max-height: 60px; max-width: 120px; object-fit: contain; }
              .header-info { flex: 1; text-align: right; }
              h1 { margin: 0; font-size: 18px; color: #2C3E50; text-transform: uppercase; }
              p { margin: 4px 0; font-size: 12px; }
              .resumo-container { display: flex; flex-wrap: wrap; justify-content: space-between; margin-bottom: 15px; background-color: #F8F9F9; padding: 15px; border-radius: 8px; border: 1px solid #E5E8E8; }
              .resumo-box { text-align: center; width: 24%; border-right: 1px solid #D5DBDB; }
              .resumo-box:last-child { border-right: none; }
              .resumo-titulo { font-size: 10px; color: #7F8C8D; font-weight: bold; text-transform: uppercase; margin-bottom: 5px; }
              .resumo-valor { font-size: 16px; font-weight: bold; }
              .nomes-container { background-color: #FDFEFE; padding: 10px; border: 1px solid #ECF0F1; margin-bottom: 20px; border-radius: 5px; }
              .nomes-container h3 { margin: 0 0 5px 0; font-size: 11px; text-transform: uppercase; }
              .nomes-container p { margin: 0 0 10px 0; font-size: 10px; color: #555; }
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
                <p>Equipe / Fiscal: <strong style="text-transform: uppercase;">${nomeDaEquipePdf}</strong></p>
              </div>
            </div>

            <div class="resumo-container">
              <div class="resumo-box"><div class="resumo-titulo">Produzido (Qtd)</div><div class="resumo-valor" style="color: #2980B9;">${totalQtd}</div></div>
              <div class="resumo-box"><div class="resumo-titulo">Total em Reais (R$)</div><div class="resumo-valor" style="color: #27AE60;">R$ ${totalValor.toFixed(2).replace('.', ',')}</div></div>
              <div class="resumo-box"><div class="resumo-titulo">Faltas Equipe</div><div class="resumo-valor" style="color: #E74C3C;">${totalFaltas}</div></div>
              <div class="resumo-box"><div class="resumo-titulo">Atestados/Abono</div><div class="resumo-valor" style="color: #E67E22;">${totalAtestados}</div></div>
            </div>

            <div class="nomes-container">
              <h3 style="color: #E74C3C;">Colaboradores Faltantes:</h3>
              <p>${nomesFaltas.length > 0 ? nomesFaltas.join(', ') : 'Nenhuma falta registrada.'}</p>
              
              <h3 style="color: #E67E22;">Atestados / Abonos:</h3>
              <p style="margin-bottom: 0;">${nomesAtestados.length > 0 ? nomesAtestados.join(', ') : 'Nenhum atestado registrado.'}</p>
            </div>

            <table>
              <thead>
                <tr><th style="width: 25%; text-align: left;">Funcionário</th><th style="width: 25%; text-align: left;">Serviço</th><th style="width: 10%;">Quadra</th><th style="width: 10%;">Ramal</th><th style="width: 10%;">Qtd</th><th style="width: 10%;">V. Unit</th><th style="width: 10%;">Total</th></tr>
              </thead>
              <tbody>${linhasTabela}</tbody>
            </table>
          </body>
        </html>
      `;

      await imprimirOuCompartilharPDF(htmlCompleto);
    } catch (err: any) {
      Alert.alert('Erro', 'Ocorreu um problema ao gerar o PDF: ' + err.message);
    } finally {
      setGerandoPdf(false);
    }
  };

  const gerarPDFResumoDetalhado = async () => {
    if (Object.keys(resumoHierarquico).length === 0) {
      return Alert.alert('Aviso', 'Não há dados de serviço para gerar este PDF.');
    }
    setGerandoPdfResumo(true);

    let nomeDaEquipePdf = 'Todas Equipes';
    if (perfilUsuario === 'Fiscal de Campo') {
      nomeDaEquipePdf = nomeUsuarioLogado;
    } else if (fiscalSelecionado !== 'TODOS') {
      const fObj = listaFiscais.find(f => f.id === fiscalSelecionado);
      if (fObj) nomeDaEquipePdf = fObj.nome;
    }

    try {
      const base64Logo = await converterLogoParaBase64();

      let htmlHierarquia = '';
      Object.keys(resumoHierarquico).sort().forEach(servico => {
         htmlHierarquia += `<div style="background-color: #2C3E50; color: #FFF; padding: 8px; font-weight: bold; margin-top: 15px; border-radius: 4px;">🛠️ SERVIÇO: ${servico} <span style="float:right; color:#F1C40F;">${resumoHierarquico[servico].total.toLocaleString('pt-BR')} un</span></div>`;
         
         Object.keys(resumoHierarquico[servico].fazendas).sort().forEach(faz => {
             htmlHierarquia += `<div style="margin-left: 10px; border-left: 3px solid #27AE60; padding-left: 10px; margin-top: 10px;">`;
             htmlHierarquia += `<div style="font-weight: bold; font-size: 13px; color: #34495E; margin-bottom: 5px;">📍 FAZENDA ${faz} <span style="float:right; color:#27AE60">${resumoHierarquico[servico].fazendas[faz].total.toLocaleString('pt-BR')} un</span></div>`;
             
             Object.keys(resumoHierarquico[servico].fazendas[faz].quadras).sort((a,b) => a.localeCompare(b, undefined, { numeric: true })).forEach(qdr => {
                 htmlHierarquia += `<div style="background-color: #ECF0F1; padding: 5px; font-weight: bold; font-size: 11px;">↳ QUADRA ${qdr} <span style="float:right">${resumoHierarquico[servico].fazendas[faz].quadras[qdr].total.toLocaleString('pt-BR')} un</span></div>`;
                 
                 htmlHierarquia += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10px;">`;
                 Object.keys(resumoHierarquico[servico].fazendas[faz].quadras[qdr].ramais).sort((a,b) => a.localeCompare(b, undefined, { numeric: true })).forEach(rm => {
                    htmlHierarquia += `<tr><td style="width: 70%; padding-left: 20px; border-bottom: 1px solid #EAEDED; padding-top: 4px; padding-bottom: 4px;">• Ramal ${rm}</td><td style="width: 30%; text-align: right; border-bottom: 1px solid #EAEDED; font-weight: bold;">${resumoHierarquico[servico].fazendas[faz].quadras[qdr].ramais[rm].toLocaleString('pt-BR')} un</td></tr>`;
                 });
                 htmlHierarquia += `</table>`;
             });
             htmlHierarquia += `</div>`;
         });
      });

      const htmlCompleto = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              @page { margin: 15mm; size: A4 portrait; }
              body { font-family: 'Arial', sans-serif; font-size: 11px; color: #333; margin: 0; padding: 0; }
              .header-container { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 2px solid #2C3E50; padding-bottom: 15px; }
              .header-logo { margin-right: 15px; }
              .header-logo img { max-height: 60px; max-width: 120px; object-fit: contain; }
              .header-info { flex: 1; text-align: right; }
              h1 { margin: 0; font-size: 18px; color: #2C3E50; text-transform: uppercase; }
            </style>
          </head>
          <body>
            <div class="header-container">
              ${base64Logo ? `<div class="header-logo"><img src="${base64Logo}" alt="Logo" /></div>` : ''}
              <div class="header-info">
                <h1>Detalhamento de Serviços por Local</h1>
                <p style="margin: 4px 0 0 0;">Data: <strong>${dataSelecionada}</strong> | Equipe: <strong style="text-transform: uppercase;">${nomeDaEquipePdf}</strong></p>
                <p style="margin: 4px 0 0 0; font-size: 14px; font-weight: bold; color: #27AE60;">Total Geral: ${totalQtd.toLocaleString('pt-BR')} un</p>
              </div>
            </div>
            ${htmlHierarquia}
          </body>
        </html>
      `;
      await imprimirOuCompartilharPDF(htmlCompleto);
    } catch (err: any) {
      Alert.alert('Erro', 'Ocorreu um problema ao gerar o PDF de Detalhes.');
    } finally {
      setGerandoPdfResumo(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Produção do Dia 📊</Text>
        <Text style={styles.subtitle}>Acompanhamento em tempo real</Text>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        
        <View style={styles.cardFiltros}>
          <View style={styles.row}>
            <View style={[styles.col, { flex: 0.4 }]}>
              <Text style={styles.label}>Data:</Text>
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
              {carregandoPerfil ? (
                <ActivityIndicator size="small" color="#2980B9" />
              ) : perfilUsuario === 'Fiscal de Campo' ? (
                <View style={[styles.input, { backgroundColor: '#EAEDED', justifyContent: 'center', height: 42, paddingVertical: 0 }]}>
                  <Text style={{ fontSize: 13, color: '#7F8C8D', fontWeight: 'bold' }} numberOfLines={1}>
                    {nomeUsuarioLogado} (Sua Equipe)
                  </Text>
                </View>
              ) : (
                <View style={styles.pickerContainer}>
                  <Picker 
                    selectedValue={fiscalSelecionado} 
                    onValueChange={setFiscalSelecionado} 
                    style={styles.picker}
                  >
                    <Picker.Item label="Todas Equipes" value="TODOS" />
                    {listaFiscais.map((fiscal, index) => (
                      <Picker.Item key={index} label={fiscal.nome} value={fiscal.id} />
                    ))}
                  </Picker>
                </View>
              )}
            </View>
          </View>

          <View style={styles.resumoContainer}>
            <View style={styles.resumoBox}>
              <Text style={styles.resumoTitulo}>Produzido (Qtd)</Text>
              <Text style={styles.resumoValorAzul}>{totalQtd}</Text>
            </View>
            <View style={styles.resumoBox}>
              <Text style={styles.resumoTitulo}>Total (R$)</Text>
              <Text style={styles.resumoValorVerde}>
                R$ {totalValor.toFixed(2).replace('.', ',')}
              </Text>
            </View>
            <View style={styles.resumoBox}>
              <Text style={styles.resumoTitulo}>Faltas Equipe</Text>
              <Text style={styles.resumoValorVermelho}>{totalFaltas}</Text>
              <Text style={{fontSize: 9, color: '#BDC3C7'}}>De {equipeTamanho} ativos</Text>
              {nomesFaltas.length > 0 && (
                 <Text style={styles.textoNomesVermelho}>{nomesFaltas.join(', ')}</Text>
              )}
            </View>
            <View style={styles.resumoBox}>
              <Text style={styles.resumoTitulo}>Atestados</Text>
              <Text style={styles.resumoValorLaranja}>{totalAtestados}</Text>
              {nomesAtestados.length > 0 && (
                 <Text style={styles.textoNomesLaranja}>{nomesAtestados.join(', ')}</Text>
              )}
            </View>
          </View>

          {Object.keys(resumoHierarquico).length > 0 && (
            <>
              <TouchableOpacity 
                onPress={() => setMostrarResumoServicos(!mostrarResumoServicos)} 
                style={styles.btnToggleResumo}
              >
                <Text style={styles.txtToggleResumo}>
                  {mostrarResumoServicos ? 'Ocultar Detalhes por Serviço e Local' : 'Ver Detalhes por Serviço e Local'}
                </Text>
              </TouchableOpacity>

              {mostrarResumoServicos && (
                <View style={styles.containerResumoDetalhado}>
                  <View>
                    {Object.keys(resumoHierarquico).sort().map((servico) => (
                      <View key={servico} style={styles.blocoServico}>
                        <View style={styles.linhaServico}>
                          <Text style={styles.txtServicoTitulo}>{servico}</Text>
                          <Text style={styles.txtServicoTotal}>{resumoHierarquico[servico].total} un</Text>
                        </View>
                        
                        {Object.keys(resumoHierarquico[servico].fazendas).sort().map((fazenda) => (
                          <View key={fazenda} style={styles.blocoFazenda}>
                            <View style={styles.linhaFazenda}>
                              <Text style={styles.txtFazendaTitulo}>📍 Fazenda {fazenda}</Text>
                              <Text style={styles.txtFazendaTotal}>{resumoHierarquico[servico].fazendas[fazenda].total} un</Text>
                            </View>
                            
                            {Object.keys(resumoHierarquico[servico].fazendas[fazenda].quadras)
                              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                              .map((quadra) => (
                                <View key={quadra} style={styles.blocoQuadra}>
                                  <View style={styles.linhaQuadra}>
                                    <Text style={styles.txtQuadraTitulo}>↳ Quadra {quadra}</Text>
                                    <Text style={styles.txtQuadraTotal}>{resumoHierarquico[servico].fazendas[fazenda].quadras[quadra].total} un</Text>
                                  </View>

                                  {Object.keys(resumoHierarquico[servico].fazendas[fazenda].quadras[quadra].ramais)
                                    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                                    .map((ramal) => (
                                      <View key={ramal} style={styles.linhaRamal}>
                                        <Text style={styles.txtRamalTitulo}>• Ramal {ramal}</Text>
                                        <Text style={styles.txtRamalTotal}>{resumoHierarquico[servico].fazendas[fazenda].quadras[quadra].ramais[ramal]} un</Text>
                                      </View>
                                    ))}
                                </View>
                              ))}
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>

                  <View style={styles.linhaTotalResumo}>
                    <Text style={styles.txtTotalGeralResumo}>TOTAL GERAL DO DIA:</Text>
                    <Text style={styles.txtValorTotalGeralResumo}>{totalQtd} un</Text>
                  </View>

                  <TouchableOpacity 
                    style={[styles.btnPdfDetalhes, gerandoPdfResumo ? styles.btnPdfDisabled : null]} 
                    onPress={gerarPDFResumoDetalhado} 
                    disabled={gerandoPdfResumo}
                  >
                    {gerandoPdfResumo ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.btnPdfText}>🖨️ Exportar PDF em Resumo (Hierárquico)</Text>}
                  </TouchableOpacity>

                </View>
              )}
            </>
          )}

          <TouchableOpacity 
            style={[styles.btnPdf, gerandoPdf || registros.length === 0 ? styles.btnPdfDisabled : null]} 
            onPress={gerarPDFPrincipal} 
            disabled={gerandoPdf || registros.length === 0}
          >
            {gerandoPdf ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.btnPdfText}>🖨️ Exportar Tabela em PDF do Dia</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.tabelaContainer}>
          {carregando ? (
            <ActivityIndicator size="large" color="#2980B9" style={{ marginVertical: 50 }} />
          ) : registros.length === 0 ? (
            <Text style={styles.emptyState}>Nenhum serviço registrado neste dia.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ flexGrow: 0 }}>
              <View style={{ minWidth: '100%' }}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { width: 150 }]}>Funcionário</Text>
                  <Text style={[styles.th, { width: 140 }]}>Serviço</Text>
                  <Text style={[styles.th, { width: 80, textAlign: 'center' }]}>Quadra</Text>
                  <Text style={[styles.th, { width: 100, textAlign: 'center' }]}>Ramal</Text>
                  <Text style={[styles.th, { width: 70, textAlign: 'center' }]}>Qtd</Text>
                  <Text style={[styles.th, { width: 90, textAlign: 'right' }]}>Valor Unit.</Text>
                  <Text style={[styles.th, { width: 90, textAlign: 'right' }]}>Total</Text>
                </View>

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
              </View>
            </ScrollView>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap' },
  col: { flex: 1, minWidth: 150, marginHorizontal: 5, marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '700', color: '#34495E', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#F8FAFC', color: '#2C3E50' },
  
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', height: 42, justifyContent: 'center' },
  picker: { height: 80, width: '100%', borderWidth: 0, backgroundColor: 'transparent' },
  
  resumoContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 5, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#ECF0F1' },
  resumoBox: { width: '24%', alignItems: 'center', marginBottom: 15 },
  resumoTitulo: { fontSize: 10, color: '#7F8C8D', fontWeight: '600', textTransform: 'uppercase', marginBottom: 5 },
  resumoValorAzul: { fontSize: 22, fontWeight: 'bold', color: '#2980B9', marginTop: 4 },
  resumoValorVerde: { fontSize: 22, fontWeight: 'bold', color: '#27AE60', marginTop: 4 },
  resumoValorVermelho: { fontSize: 22, fontWeight: 'bold', color: '#E74C3C', marginTop: 4 },
  resumoValorLaranja: { fontSize: 22, fontWeight: 'bold', color: '#E67E22', marginTop: 4 },
  
  textoNomesVermelho: { fontSize: 9, color: '#E74C3C', textAlign: 'center', marginTop: 4, fontStyle: 'italic', fontWeight: 'bold' },
  textoNomesLaranja: { fontSize: 9, color: '#E67E22', textAlign: 'center', marginTop: 4, fontStyle: 'italic', fontWeight: 'bold' },

  btnToggleResumo: { marginTop: 5, padding: 10, backgroundColor: '#EBF5FB', borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#AED6F1' },
  txtToggleResumo: { color: '#2980B9', fontWeight: 'bold', fontSize: 13 },
  containerResumoDetalhado: { marginTop: 10, backgroundColor: '#FFF', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#BDC3C7' },
  
  blocoServico: { marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#ECF0F1', paddingBottom: 10 },
  linhaServico: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#2C3E50', padding: 8, borderRadius: 5 },
  txtServicoTitulo: { fontSize: 14, fontWeight: 'bold', color: '#FFF' },
  txtServicoTotal: { fontSize: 14, fontWeight: 'bold', color: '#F1C40F' },
  
  blocoFazenda: { marginTop: 8, paddingLeft: 10 },
  linhaFazenda: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F4F6F6', padding: 6, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#27AE60' },
  txtFazendaTitulo: { fontSize: 13, fontWeight: 'bold', color: '#34495E' },
  txtFazendaTotal: { fontSize: 13, fontWeight: 'bold', color: '#27AE60' },
  
  blocoQuadra: { paddingBottom: 4 },
  linhaQuadra: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingLeft: 20 },
  txtQuadraTitulo: { fontSize: 12, fontWeight: 'bold', color: '#34495E' },
  txtQuadraTotal: { fontSize: 12, fontWeight: 'bold', color: '#34495E' },

  linhaRamal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingLeft: 35, borderBottomWidth: 1, borderBottomColor: '#F4F6F6' },
  txtRamalTitulo: { fontSize: 11, color: '#7F8C8D' },
  txtRamalTotal: { fontSize: 11, fontWeight: 'bold', color: '#7F8C8D' },

  linhaTotalResumo: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingTop: 10, marginTop: 5, borderTopWidth: 2, borderTopColor: '#2C3E50' },
  txtTotalGeralResumo: { fontSize: 12, fontWeight: 'bold', color: '#34495E', marginRight: 10 },
  txtValorTotalGeralResumo: { fontSize: 16, fontWeight: 'bold', color: '#27AE60' },

  btnPdf: { backgroundColor: '#34495E', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  btnPdfDetalhes: { backgroundColor: '#2980B9', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  btnPdfDisabled: { backgroundColor: '#95A5A6' },
  btnPdfText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },

  tabelaContainer: { backgroundColor: '#FFF', marginHorizontal: 15, marginBottom: 30, borderRadius: 12, elevation: 3, overflow: 'hidden' },
  emptyState: { textAlign: 'center', marginVertical: 40, color: '#95A5A6', fontSize: 15, fontStyle: 'italic' },
  
  tableHeader: { flexDirection: 'row', backgroundColor: '#2C3E50', paddingVertical: 12, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  th: { color: '#FFF', fontSize: 13, fontWeight: 'bold', paddingHorizontal: 10 },
  
  tableRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#ECF0F1' },
  rowEven: { backgroundColor: '#FDFEFE' },
  rowOdd: { backgroundColor: '#F4F6F6' },
  td: { fontSize: 13, color: '#2C3E50', paddingHorizontal: 10 },
});