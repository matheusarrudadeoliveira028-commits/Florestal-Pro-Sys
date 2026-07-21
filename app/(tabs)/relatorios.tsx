import { Picker } from '@react-native-picker/picker';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase'; // Ajuste o caminho se necessário

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

  return feriados.map(dMes => `${ano}-${dMes.split('/')[1]}-${dMes.split('/')[0]}`);
};

export default function RelatoriosScreen() {
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState('TODOS');
  const [fiscalSelecionado, setFiscalSelecionado] = useState('TODOS');
  
  // 🟢 ESTADOS PARA CONTROLE DE PERFIL
  const [perfilUsuario, setPerfilUsuario] = useState('ADMIN'); 
  const [carregandoPerfil, setCarregandoPerfil] = useState(true);

  // DATAS E FERIADOS
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [feriados, setFeriados] = useState('');
  const [filtroAtivo, setFiltroAtivo] = useState('');

  const [listaColaboradores, setListaColaboradores] = useState<any[]>([]);
  // 🟢 ESTADO PARA LISTA FILTRADA DE COLABORADORES
  const [listaColaboradoresFiltrada, setListaColaboradoresFiltrada] = useState<any[]>([]);
  const [listaFiscais, setListaFiscais] = useState<string[]>([]);
  
  const [gerando, setGerando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  // 🟢 FUNÇÕES UTILITÁRIAS
  const limparNome = (nome: string) => {
    if (!nome) return '';
    return nome.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
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

  useEffect(() => {
    carregarPerfilUsuario(); 
    carregarColaboradores();
    carregarFiscais();
    
    const hoje = new Date();
    if (hoje.getDate() <= 15) {
      aplicarFiltroData('1Q');
    } else {
      aplicarFiltroData('2Q');
    }
  }, []);

  // 🟢 EFEITO QUE FILTRA OS COLABORADORES QUANDO O FISCAL MUDA
  useEffect(() => {
    const atualizarListaColaboradores = async () => {
      if (fiscalSelecionado === 'TODOS') {
        setListaColaboradoresFiltrada(listaColaboradores);
      } else {
        // Busca em TODO o histórico quem já fez parte da equipe deste fiscal
        const { data } = await supabase
          .from('diarios_campo')
          .select('colaborador')
          .eq('fiscal_nome', fiscalSelecionado);

        if (data) {
          const nomesDaEquipeLimpos = [...new Set(data.map(item => limparNome(item.colaborador)).filter(Boolean))];
          const filtrados = listaColaboradores.filter(c => nomesDaEquipeLimpos.includes(limparNome(c.nome)));
          setListaColaboradoresFiltrada(filtrados);
        } else {
          setListaColaboradoresFiltrada([]);
        }
      }
      setColaboradorSelecionado('TODOS');
    };

    if (listaColaboradores.length > 0) {
      atualizarListaColaboradores();
    }
  }, [fiscalSelecionado, listaColaboradores]);

  // 🟢 FUNÇÃO PARA BUSCAR O USUÁRIO LOGADO E VERIFICAR SE É FISCAL DE CAMPO
  const carregarPerfilUsuario = async () => {
    setCarregandoPerfil(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      const { data: usuarioData } = await supabase
        .from('perfis') 
        .select('cargo, nome')
        .eq('id', user.id) 
        .single();

      if (usuarioData) {
        setPerfilUsuario(usuarioData.cargo);
        
        // Se o cargo for "Fiscal de Campo", trava o select no nome dele
        if (usuarioData.cargo === 'Fiscal de Campo') {
          setFiscalSelecionado(usuarioData.nome);
        }
      }
    }
    setCarregandoPerfil(false);
  };

  const carregarColaboradores = async () => {
    setCarregando(true);
    const { data } = await supabase.from('colaboradores').select('*').order('nome');
    if (data) {
      setListaColaboradores(data);
      setListaColaboradoresFiltrada(data); 
    }
    setCarregando(false);
  };

  const carregarFiscais = async () => {
    const { data } = await supabase.from('diarios_campo').select('fiscal_nome');
    if (data) {
      const unicos = [...new Set(data.map(item => item.fiscal_nome).filter(Boolean))];
      setListaFiscais(unicos.sort() as string[]);
    }
  };

  const aplicarFiltroData = (tipo: '1Q' | '2Q' | 'MES') => {
    setFiltroAtivo(tipo);
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth(); 
    
    if (tipo === '1Q') {
      setDataInicio(`01/${String(mes + 1).padStart(2, '0')}/${ano}`);
      setDataFim(`15/${String(mes + 1).padStart(2, '0')}/${ano}`);
    } else if (tipo === '2Q') {
      setDataInicio(`16/${String(mes + 1).padStart(2, '0')}/${ano}`);
      const ultimoDia = new Date(ano, mes + 1, 0).getDate(); 
      setDataFim(`${ultimoDia}/${String(mes + 1).padStart(2, '0')}/${ano}`);
    } else {
      setDataInicio(`01/${String(mes + 1).padStart(2, '0')}/${ano}`);
      const ultimoDia = new Date(ano, mes + 1, 0).getDate();
      setDataFim(`${ultimoDia}/${String(mes + 1).padStart(2, '0')}/${ano}`);
    }
  };

  const gerarPDF = async () => {
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

      let query = supabase.from('diarios_campo').select('*')
        .gte('data', `${dtInicioBD} 00:00:00`)
        .lte('data', `${dtFimBD} 23:59:59`)
        .order('data', { ascending: true });

      if (fiscalSelecionado !== 'TODOS') {
        query = query.eq('fiscal_nome', fiscalSelecionado);
      }

      if (colaboradorSelecionado !== 'TODOS') {
        query = query.eq('colaborador', colaboradorSelecionado);
      }

      const { data: lancamentosData, error: errLanc } = await query;
      if (errLanc) throw errLanc;

      const lancamentos = lancamentosData || [];

      // Se não encontrou lançamento e a pesquisa foi para TODOS sem especificar fiscal, aborta.
      if (lancamentos.length === 0 && colaboradorSelecionado === 'TODOS' && fiscalSelecionado === 'TODOS') {
        setGerando(false);
        return Alert.alert('Aviso', 'Nenhum lançamento encontrado para este período.');
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

      // 🟢 O PULO DO GATO APRIMORADO:
      // Se selecionou uma equipe (Fiscal) e TODOS os colaboradores, varre a lista da equipe inteira
      // e cria folhas vazias para quem faltou todos os dias!
      if (fiscalSelecionado !== 'TODOS' && colaboradorSelecionado === 'TODOS') {
        listaColaboradoresFiltrada.forEach(colab => {
          const nomeLimpo = limparNome(colab.nome);
          const temFolha = Object.keys(agrupado).some(chave => limparNome(agrupado[chave].nome) === nomeLimpo);
          
          if (!temFolha) {
            agrupado[`${colab.nome}_Registrado`] = {
              nome: colab.nome,
              tipo: 'Registrado',
              registros: []
            };
          }
        });
      } else if (colaboradorSelecionado !== 'TODOS') {
        // Se escolheu um colaborador específico que não tem produção, cria folha vazia
        const temFolha = Object.keys(agrupado).some(chave => agrupado[chave].nome === colaboradorSelecionado);
        if (!temFolha) {
          agrupado[`${colaboradorSelecionado}_Registrado`] = {
            nome: colaboradorSelecionado,
            tipo: 'Registrado',
            registros: []
          };
        }
      }

      const chavesFolhas = Object.keys(agrupado);
      
      if (chavesFolhas.length === 0) {
        setGerando(false);
        return Alert.alert('Aviso', 'Nenhum lançamento encontrado para gerar.');
      }

      let paginasHTML = '';

      chavesFolhas.forEach((chave, index) => {
        const folha = agrupado[chave];
        
        const totalGeral = folha.registros.reduce((soma: number, item: any) => soma + (item.valor_total || 0), 0);
        const totalQuantidade = folha.registros.reduce((soma: number, item: any) => soma + (Number(item.quantidade) || 0), 0);
        
        // Puxa o nome do fiscal da seleção ou do primeiro registro
        const encarregadoNome = folha.registros.length > 0 && folha.registros[0].fiscal_nome 
            ? folha.registros[0].fiscal_nome 
            : (fiscalSelecionado !== 'TODOS' ? fiscalSelecionado : 'Não Identificado');

        const fazendasTrabalhadas = [...new Set(folha.registros.map((r: any) => r.fazenda).filter(Boolean))].join(' / ') || 'Não Informada';

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
            // 👉 ALGORITMO DE AGRUPAMENTO
            // Agrupa os lançamentos por Serviço, Fazenda, Quadra e Valor Unitário
            const registrosAgrupados = registrosDoDia.reduce((acc: any, item: any) => {
              const chave = `${item.servico}_${item.fazenda}_${item.quadra}_${item.valor_unitario}`;
              
              if (!acc[chave]) {
                // Se ainda não existe esse agrupamento no dia, cria o primeiro registro
                acc[chave] = {
                  ...item,
                  quantidade: Number(item.quantidade) || 0,
                  valor_total: Number(item.valor_total) || 0,
                  ramais: item.ramal ? [String(item.ramal)] : []
                };
              } else {
                // Se já existe, apenas soma a quantidade e o valor, e adiciona o ramal à lista
                acc[chave].quantidade += Number(item.quantidade) || 0;
                acc[chave].valor_total += Number(item.valor_total) || 0;
                if (item.ramal) {
                  acc[chave].ramais.push(String(item.ramal));
                }
              }
              return acc;
            }, {});

            // 👉 GERAÇÃO DAS LINHAS HTML AGRUPADAS
            Object.values(registrosAgrupados).forEach((item: any) => {
              // Remove ramais duplicados e formata com vírgula
              const ramaisUnicos = [...new Set(item.ramais)];
              const ramaisStr = ramaisUnicos.join(', ') || '-'; 
              
              const valorUni = item.valor_unitario ? item.valor_unitario.toFixed(4).replace('.', ',') : '0,00';
              const valorTot = item.valor_total ? item.valor_total.toFixed(2).replace('.', ',') : '0,00';
              
              linhasTabela += `
                <tr>
                  <td>${diaMesStr}</td>
                  <td>${item.servico || '-'}</td>
                  <td>${item.fazenda || '-'}</td>
                  <td>${item.quadra || '-'}</td>
                  <td>${ramaisStr}</td>
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
            <!-- CABEÇALHO NOVO E LIMPO (SEM ENDEREÇO, COM FISCAL) -->
            <div class="header-container">
              ${base64Logo ? `<div class="header-logo"><img src="${base64Logo}" alt="Logo" /></div>` : ''}
              <div class="header-left">
                <p>Período: <strong>${dataInicio} até ${dataFim}</strong></p>
                <p>Fazenda(s): <strong style="font-size: 14px;">${fazendasTrabalhadas}</strong></p>
                <p>Colaborador: <strong style="font-size: 16px; text-transform: uppercase;">${folha.nome}</strong></p>
                ${folha.tipo === 'Registrado' ? '' : `<p>Produção: <strong style="color: #E74C3C; text-transform: uppercase;">${folha.tipo}</strong></p>`}
              </div>
              
              <!-- 🟢 ÁREA DO FISCAL NO LADO DIREITO -->
              <div class="header-right">
                <p style="color: #555; font-size: 11px;">Fiscal / Encarregado</p>
                <p><strong style="font-size: 15px; text-transform: uppercase; color: #2C3E50;">${encarregadoNome}</strong></p>
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
                <tr>
                  <td colspan="5" style="text-align: right; font-weight: bold; background-color: #E8E8E8;">QUANTIDADE TOTAL:</td>
                  <td style="font-weight: bold; background-color: #E8E8E8; font-size: 13px;">${totalQuantidade}</td>
                  <td colspan="2" style="background-color: #E8E8E8;"></td>
                </tr>
              </tbody>
            </table>

            <!-- RECIBO OFICIAL -->
            <table style="width: 100%; border-collapse: collapse; margin-top: 30px; border: 1px solid #000;">
              <tr>
                <td style="text-align: center; font-weight: bold; font-size: 16px; padding: 6px; border-bottom: 1px solid #000;">RECIBO</td>
              </tr>
              <tr>
                <td style="text-align: center; padding: 15px; font-size: 13px; line-height: 1.6;">
                  Declaro ter recebido da empresa LUIZ FELIPE AREOVALDO CALHIM MANOEL ABUD, CNPJ nº 08.396.358/0007-82, a importância total de 
                  <strong style="font-size: 15px;">R$ ${totalGeral.toFixed(2).replace('.', ',')}</strong> 
                  referente a produção conforme respectivas datas e valores discriminados:
                </td>
              </tr>
            </table>

            <!-- ÁREA DE ASSINATURA -->
            <div class="signature-area">
              <hr style="width: 350px; border: 1px solid #000; margin-bottom: 5px;">
              <p style="font-size: 14px; font-weight: bold; text-transform: uppercase;">${folha.nome}</p>
              <p style="font-size: 11px; color: #555;">Assinatura do Colaborador</p>
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
            <title>Relatório de Produção - Quinzenal</title>
            <style>
              @page { margin: 15mm; size: A4; }
              body { font-family: 'Arial', sans-serif; font-size: 12px; color: #000; background-color: #FFF; margin: 0; padding: 0; }
              .quebra-pagina { page-break-after: always; }
              .header-container { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px; }
              .header-logo { margin-right: 15px; display: flex; align-items: center; justify-content: center; }
              .header-logo img { max-height: 70px; max-width: 100px; object-fit: contain; }
              .header-left { flex: 1; }
              .header-left p, .header-right p { margin: 4px 0; font-size: 13px; }
              .header-right { text-align: right; background-color: #F8F9F9; padding: 10px 15px; border-radius: 8px; border: 1px solid #E5E8E8; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
              th, td { border: 1px solid #000; padding: 5px 4px; text-align: center; font-size: 11px; }
              th { background-color: #E8E8E8; font-weight: bold; text-transform: uppercase; font-size: 10px; }
              tr:nth-child(even) { background-color: #F9F9F9; }
              .signature-area { margin-top: 60px; text-align: center; page-break-inside: avoid; }
            </style>
          </head>
          <body>
            ${paginasHTML}
          </body>
        </html>
      `;

      // BIFURCAÇÃO PERFEITA WEB x MOBILE
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
      setGerando(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Folha de Produção 📄</Text>
        <Text style={styles.subtitle}>Gerar extratos e recibos</Text>
      </View>

      <View style={styles.card}>
        
        {/* 👉 BOTÕES DE QUINZENA RÁPIDA */}
        <Text style={styles.label}>Período de Fechamento:</Text>
        <View style={styles.botoesQuinzena}>
          <TouchableOpacity 
            style={[styles.btnQuinzena, filtroAtivo === '1Q' && styles.btnQuinzenaAtivo]}
            onPress={() => aplicarFiltroData('1Q')}
          >
            <Text style={[styles.txtBtnQuinzena, filtroAtivo === '1Q' && styles.txtBtnQuinzenaAtivo]}>1ª Quinzena</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.btnQuinzena, filtroAtivo === '2Q' && styles.btnQuinzenaAtivo]}
            onPress={() => aplicarFiltroData('2Q')}
          >
            <Text style={[styles.txtBtnQuinzena, filtroAtivo === '2Q' && styles.txtBtnQuinzenaAtivo]}>2ª Quinzena</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.btnQuinzena, filtroAtivo === 'MES' && styles.btnQuinzenaAtivo]}
            onPress={() => aplicarFiltroData('MES')}
          >
            <Text style={[styles.txtBtnQuinzena, filtroAtivo === 'MES' && styles.txtBtnQuinzenaAtivo]}>Mês Cheio</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.labelData}>Data Inicial:</Text>
            <TextInput style={styles.input} value={dataInicio} onChangeText={setDataInicio} placeholder="DD/MM/AAAA" keyboardType="numeric" />
          </View>
          <View style={styles.col}>
            <Text style={styles.labelData}>Data Final:</Text>
            <TextInput style={styles.input} value={dataFim} onChangeText={setDataFim} placeholder="DD/MM/AAAA" keyboardType="numeric" />
          </View>
        </View>

        <Text style={styles.label}>Selecione o Fiscal / Encarregado:</Text>
        {carregando || carregandoPerfil ? (
          <ActivityIndicator color="#2980B9" />
        ) : perfilUsuario === 'Fiscal de Campo' ? (
          <View style={[styles.input, { backgroundColor: '#EAEDED', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 16, color: '#7F8C8D', fontWeight: 'bold' }}>
              {fiscalSelecionado} (Apenas sua equipe)
            </Text>
          </View>
        ) : (
          <View style={styles.pickerContainer}>
            <Picker selectedValue={fiscalSelecionado} onValueChange={setFiscalSelecionado} style={styles.picker}>
              <Picker.Item label="👉 TODOS OS FISCAIS / EQUIPES" value="TODOS" />
              {listaFiscais.map((nome, index) => (
                <Picker.Item key={index} label={nome} value={nome} />
              ))}
            </Picker>
          </View>
        )}

        <Text style={styles.label}>Selecione o Colaborador:</Text>
        {carregando ? (
          <ActivityIndicator color="#2980B9" />
        ) : (
          <View style={styles.pickerContainer}>
            {/* 🟢 LISTA EXIBE APENAS OS COLABORADORES DA EQUIPE FILTRADA */}
            <Picker selectedValue={colaboradorSelecionado} onValueChange={setColaboradorSelecionado} style={styles.picker}>
              <Picker.Item label="👉 TODOS OS COLABORADORES" value="TODOS" />
              {listaColaboradoresFiltrada.map((item) => (
                <Picker.Item key={item.id} label={item.nome} value={item.nome} />
              ))}
            </Picker>
          </View>
        )}

        <TouchableOpacity style={[styles.button, gerando ? styles.buttonDisabled : null]} onPress={gerarPDF} disabled={gerando}>
          {gerando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Gerar Relatório em PDF</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', padding: 20 },
  header: { marginBottom: 25, marginTop: 10, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 16, color: '#7F8C8D', marginTop: 5 },
  card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 15, elevation: 5 },
  label: { fontSize: 14, fontWeight: '700', color: '#34495E', marginBottom: 10, marginTop: 15 },
  labelData: { fontSize: 12, fontWeight: '600', color: '#7F8C8D', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#F8FAFC', color: '#2C3E50', marginBottom: 10 },
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', overflow: 'hidden', marginBottom: 15, marginTop: 5 },
  picker: { height: 50, width: '100%', borderWidth: 0, backgroundColor: 'transparent' },
  button: { backgroundColor: '#2980B9', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 15 },
  buttonDisabled: { backgroundColor: '#AED6F1' },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  col: { width: '48%' },
  botoesQuinzena: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  btnQuinzena: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: '#2980B9', borderRadius: 6, marginHorizontal: 3, alignItems: 'center', backgroundColor: '#FFF' },
  btnQuinzenaAtivo: { backgroundColor: '#2980B9' },
  txtBtnQuinzena: { color: '#2980B9', fontSize: 12, fontWeight: 'bold' },
  txtBtnQuinzenaAtivo: { color: '#FFF' },
});