import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import React, { memo, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

// =========================================================================
// 🟢 BUSCA PAGINADA ORDENADA POR ID (Busca 100% do banco sem duplicar linhas)
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

// 🟢 ARREDONDAMENTO LIMPO (Impede dízimas como 89.10000000000001)
const arredondar = (num: any): number => {
  const n = Number(num) || 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

// 🟢 FORMATAÇÃO VISUAL BRASILEIRA (Ex: 89.1 vira 89,1 | 1005 vira 1.005)
const formatarQtd = (num: any): string => {
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

const normalizarNomeFazenda = (nome: any): string => {
  if (!nome) return 'SEM FAZENDA';
  return normalizarTexto(nome)
    .replace(/^FAZENDA\s+/i, '')
    .replace(/^FAZ\.?\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// =========================================================================
// 🟢 COMPONENTE ISOLADO: CARD DA FAZENDA COM OS 3 HISTÓRICOS EXPANSÍVEIS
// =========================================================================
const FazendaEstoqueCard = memo(({ item }: { item: any }) => {
  const [expandidoEntradas, setExpandidoEntradas] = useState(false);
  const [expandidoRemocoes, setExpandidoRemocoes] = useState(false);
  const [expandidoSaidas, setExpandidoSaidas] = useState(false);

  return (
    <View style={styles.cardFazenda}>
      {/* CABEÇALHO DA FAZENDA */}
      <View style={styles.headerFazenda}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <View style={styles.iconeFazendaBox}>
            <MaterialCommunityIcons name="pine-tree" size={24} color="#FFF" />
          </View>
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={styles.nomeFazenda}>{item.fazenda}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
              <View style={[styles.badgeResina, item.resina === 'TROPICAL' && { backgroundColor: '#E67E22' }, item.resina === 'HÍBRIDO' && { backgroundColor: '#8E44AD' }]}>
                <Text style={styles.textoBadgeResina}>{item.resina}</Text>
              </View>
              <View style={[styles.badgeStatus, { backgroundColor: item.saldo > 0 ? '#E8F8F5' : '#F2F4F4' }]}>
                <Text style={[styles.textoBadgeStatus, { color: item.saldo > 0 ? '#27AE60' : '#7F8C8D' }]}>
                  {item.saldo > 0 ? '● Estoque Ativo' : '○ Saldo Zerado'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* BLOCO 1: VISÃO FLORESTA (MATO) */}
      <Text style={styles.secaoCardTitulo}>🌲 MOVIMENTAÇÃO NA FLORESTA (MATO)</Text>
      <View style={styles.linhaValores}>
        <View style={styles.colunaValor3}>
          <Text style={styles.labelValor}>Anterior</Text>
          <Text style={[styles.textoValor, { color: '#8E44AD' }]}>{formatarQtd(item.anterior)}</Text>
        </View>
        <View style={styles.colunaValor3}>
          <Text style={styles.labelValor}>Coletados</Text>
          <Text style={[styles.textoValor, { color: '#27AE60' }]}>+ {formatarQtd(item.entradas)}</Text>
        </View>
        <View style={styles.colunaValor3}>
          <Text style={styles.labelValor}>Perdas / Baixas</Text>
          <Text style={[styles.textoValor, { color: '#E74C3C' }]}>- {formatarQtd(item.baixas)}</Text>
        </View>
      </View>

      {/* BLOCO 2: VISÃO LOGÍSTICA (REMOÇÃO E EXPEDIÇÃO) */}
      <Text style={styles.secaoCardTitulo}>🚜 MOVIMENTAÇÃO LOGÍSTICA (PÁTIO E CARGA)</Text>
      <View style={[styles.linhaValores, { marginTop: 0 }]}>
        <View style={[styles.colunaValor2, { backgroundColor: '#EBF5FB', borderColor: '#AED6F1' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <MaterialCommunityIcons name="tractor" size={16} color="#2980B9" style={{ marginRight: 4 }} />
            <Text style={[styles.labelValor, { color: '#2980B9', marginBottom: 0 }]}>Removidos (P/ Pátio)</Text>
          </View>
          <Text style={[styles.textoValorDestaque, { color: '#2980B9' }]}>+ {formatarQtd(item.removidos)} tbrs</Text>
        </View>

        <View style={[styles.colunaValor2, { backgroundColor: '#FEF5E7', borderColor: '#F5CBA7' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <MaterialCommunityIcons name="truck-fast" size={16} color="#E67E22" style={{ marginRight: 4 }} />
            <Text style={[styles.labelValor, { color: '#D35400', marginBottom: 0 }]}>Expedidos (Cargas)</Text>
          </View>
          <Text style={[styles.textoValorDestaque, { color: '#E67E22' }]}>- {formatarQtd(item.saidas)} tbrs</Text>
        </View>
      </View>

      {/* BLOCO 3: BARRAS DE SALDO ATUAL */}
      <View style={styles.containerSaldos}>
        <View style={[styles.barraSaldo, { backgroundColor: '#E8F8F5', borderColor: '#A9DFBF', marginBottom: 6 }]}>
          <Text style={[styles.labelSaldoTotal, { color: '#1E8449' }]}>🌲 NO MATO (Falta Remover p/ Pátio):</Text>
          <Text style={[styles.valorSaldoTotal, { color: '#1E8449' }]}>{formatarQtd(item.saldoMato)} un</Text>
        </View>

        <View style={[styles.barraSaldo, { backgroundColor: '#EAF2F8', borderColor: '#AED6F1', marginBottom: 6 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.labelSaldoTotal, { color: '#2980B9' }]}>🚜 DISPONÍVEL PARA CARGA (Pátio):</Text>
            {item.removidos === 0 && item.saldo > 0 && (
              <Text style={{ fontSize: 10, color: '#5D6D7E', marginTop: 2 }}>
                * Nenhuma remoção lançada no app para esta fazenda
              </Text>
            )}
          </View>
          <Text style={[styles.valorSaldoTotal, { color: '#2980B9' }]}>{formatarQtd(item.saldoPatio)} un</Text>
        </View>

        <View style={[styles.barraSaldo, { backgroundColor: '#2C3E50', borderColor: '#2C3E50' }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.labelSaldoTotal, { color: '#FFF' }]}>📦 TOTAL GERAL (Mato + Pátio):</Text>
            {item.saldoBruto < 0 && (
              <Text style={{ fontSize: 10, color: '#F5B041', marginTop: 2 }}>
                * Expedição superou frações de coleta em {formatarQtd(Math.abs(item.saldoBruto))} tbr(s)
              </Text>
            )}
          </View>
          <Text style={[styles.valorSaldoTotal, { color: '#F1C40F', fontSize: 18 }]}>{formatarQtd(item.saldo)} un</Text>
        </View>
      </View>

      {/* BLOCO 4: BOTÕES DE HISTÓRICO EXPANSÍVEIS */}
      <View style={styles.botoesHistoricoContainer}>
        {/* 1. HISTÓRICO DE COLETAS */}
        {item.historicoEntradas && item.historicoEntradas.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <TouchableOpacity 
              style={[styles.btnToggleHistorico, { backgroundColor: '#E8F8F5', borderColor: '#A9DFBF' }]} 
              onPress={() => setExpandidoEntradas(!expandidoEntradas)}
            >
              <Ionicons name={expandidoEntradas ? "chevron-up" : "chevron-down"} size={16} color="#27AE60" />
              <Text style={[styles.txtToggleHistorico, { color: '#27AE60' }]}>
                {expandidoEntradas ? "Ocultar Coletas" : `Ver Histórico de Coletas (${item.historicoEntradas.length} reg. • ${formatarQtd(item.entradas)} tbrs)`}
              </Text>
            </TouchableOpacity>
            {expandidoEntradas && (
              <View style={[styles.containerHistorico, { borderColor: '#A9DFBF' }]}>
                <Text style={styles.tituloHistorico}>📥 Detalhamento de Coletas (Mato)</Text>
                {item.historicoEntradas.map((entrada: any, idx: number) => {
                  let dataFormatada = 'Data N/I';
                  if (entrada.data) {
                    const d = entrada.data.split('T')[0].split('-');
                    if (d.length === 3) dataFormatada = `${d[2]}/${d[1]}/${d[0]}`;
                  }
                  return (
                    <View key={`ent-${idx}`} style={styles.itemHistorico}>
                      <View style={styles.historicoIcone}>
                        <Ionicons name="leaf" size={20} color="#27AE60" />
                      </View>
                      <View style={styles.historicoDados}>
                        <Text style={styles.historicoData}>
                          {dataFormatada} {entrada.quadra && entrada.quadra !== '-' ? `• Qd ${entrada.quadra}` : ''} {entrada.ramal && entrada.ramal !== '-' ? `(Rm ${entrada.ramal})` : ''}
                        </Text>
                        <Text style={styles.historicoRomaneio}>
                          Colab: <Text style={{ fontWeight: 'bold', color: '#2C3E50' }}>{entrada.colaborador}</Text>
                        </Text>
                      </View>
                      <View style={[styles.historicoQtd, { backgroundColor: '#E8F8F5' }]}>
                        <Text style={[styles.historicoQtdValor, { color: '#27AE60' }]}>+ {formatarQtd(entrada.quantidade)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* 2. HISTÓRICO DE REMOÇÕES (PÁTIO) */}
        {item.historicoRemocoes && item.historicoRemocoes.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <TouchableOpacity 
              style={[styles.btnToggleHistorico, { backgroundColor: '#EBF5FB', borderColor: '#AED6F1' }]} 
              onPress={() => setExpandidoRemocoes(!expandidoRemocoes)}
            >
              <Ionicons name={expandidoRemocoes ? "chevron-up" : "chevron-down"} size={16} color="#2980B9" />
              <Text style={[styles.txtToggleHistorico, { color: '#2980B9' }]}>
                {expandidoRemocoes ? "Ocultar Remoções" : `Ver Histórico de Remoções (${item.historicoRemocoes.length} reg. • ${formatarQtd(item.removidos)} tbrs)`}
              </Text>
            </TouchableOpacity>
            {expandidoRemocoes && (
              <View style={[styles.containerHistorico, { borderColor: '#AED6F1' }]}>
                <Text style={styles.tituloHistorico}>🚜 Detalhamento de Remoções (Mato ➔ Pátio)</Text>
                {item.historicoRemocoes.map((remocao: any, idx: number) => {
                  let dataFormatada = 'Data N/I';
                  if (remocao.data) {
                    const d = remocao.data.split('T')[0].split('-');
                    if (d.length === 3) dataFormatada = `${d[2]}/${d[1]}/${d[0]}`;
                  }
                  return (
                    <View key={`rem-${idx}`} style={styles.itemHistorico}>
                      <View style={styles.historicoIcone}>
                        <MaterialCommunityIcons name="tractor" size={20} color="#2980B9" />
                      </View>
                      <View style={styles.historicoDados}>
                        <Text style={styles.historicoData}>
                          {dataFormatada} • Quadra: <Text style={{ fontWeight: 'bold', color: '#2C3E50' }}>{remocao.quadra}</Text> {remocao.ramal && remocao.ramal !== '-' ? `(Rm ${remocao.ramal})` : ''}
                        </Text>
                        <Text style={styles.historicoRomaneio}>
                          Resp: <Text style={{ fontWeight: 'bold', color: '#34495E' }}>{remocao.colaborador}</Text>
                        </Text>
                      </View>
                      <View style={[styles.historicoQtd, { backgroundColor: '#EAF2F8' }]}>
                        <Text style={[styles.historicoQtdValor, { color: '#2980B9' }]}>+ {formatarQtd(remocao.quantidade)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* 3. HISTÓRICO DE EXPEDIÇÕES (CARGAS) */}
        {item.historicoSaidas && item.historicoSaidas.length > 0 && (
          <View>
            <TouchableOpacity 
              style={[styles.btnToggleHistorico, { backgroundColor: '#FEF5E7', borderColor: '#F5CBA7' }]} 
              onPress={() => setExpandidoSaidas(!expandidoSaidas)}
            >
              <Ionicons name={expandidoSaidas ? "chevron-up" : "chevron-down"} size={16} color="#E67E22" />
              <Text style={[styles.txtToggleHistorico, { color: '#E67E22' }]}>
                {expandidoSaidas ? "Ocultar Expedições" : `Ver Histórico de Expedições (${item.historicoSaidas.length} reg. • ${formatarQtd(item.saidas)} tbrs)`}
              </Text>
            </TouchableOpacity>
            {expandidoSaidas && (
              <View style={[styles.containerHistorico, { borderColor: '#F5CBA7' }]}>
                <Text style={styles.tituloHistorico}>🚚 Detalhamento de Expedições (Cargas)</Text>
                {item.historicoSaidas.map((saida: any, idx: number) => {
                  let dataFormatada = 'Data N/I';
                  if (saida.data) {
                    const d = saida.data.split('T')[0].split('-');
                    if (d.length === 3) dataFormatada = `${d[2]}/${d[1]}/${d[0]}`;
                  }
                  return (
                    <View key={`sai-${idx}`} style={styles.itemHistorico}>
                      <View style={styles.historicoIcone}>
                        <MaterialCommunityIcons name="truck-fast" size={20} color="#E67E22" />
                      </View>
                      <View style={styles.historicoDados}>
                        <Text style={styles.historicoData}>{dataFormatada}</Text>
                        <Text style={styles.historicoRomaneio}>
                          Romaneio: <Text style={{ fontWeight: 'bold', color: '#2C3E50' }}>{saida.romaneio}</Text>
                        </Text>
                      </View>
                      <View style={[styles.historicoQtd, { backgroundColor: '#FDEDEC' }]}>
                        <Text style={[styles.historicoQtdValor, { color: '#C0392B' }]}>- {formatarQtd(saida.quantidade)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
});

// =========================================================================
// TELA PRINCIPAL DE ESTOQUE
// =========================================================================
export default function EstoqueDashboard() {
  const [estoque, setEstoque] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Totais Globais Completos
  const [totalGlobal, setTotalGlobal] = useState(0);
  const [totalPatioGlobal, setTotalPatioGlobal] = useState(0);
  const [totalMatoGlobal, setTotalMatoGlobal] = useState(0);
  const [totalColetadoGlobal, setTotalColetadoGlobal] = useState(0);
  const [totalRemovidoGlobal, setTotalRemovidoGlobal] = useState(0);
  const [totalExpedidoGlobal, setTotalExpedidoGlobal] = useState(0);
  const [totalAnteriorGlobal, setTotalAnteriorGlobal] = useState(0);
  const [totalBaixasGlobal, setTotalBaixasGlobal] = useState(0);

  // Filtros
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [filtroResina, setFiltroResina] = useState('TODAS');

  // Modais
  const [modalAnteriorVisivel, setModalAnteriorVisivel] = useState(false);
  const [listaFazendas, setListaFazendas] = useState<string[]>([]);
  const [fazendaAnterior, setFazendaAnterior] = useState('');
  const [resinaAnterior, setResinaAnterior] = useState('ELLIOTTI');
  const [quantidadeAnterior, setQuantidadeAnterior] = useState('');
  const [salvandoAnterior, setSalvandoAnterior] = useState(false);

  const [modalBaixaVisivel, setModalBaixaVisivel] = useState(false);
  const [fazendaBaixa, setFazendaBaixa] = useState('');
  const [resinaBaixa, setResinaBaixa] = useState('ELLIOTTI');
  const [quantidadeBaixa, setQuantidadeBaixa] = useState('');
  const [motivoBaixa, setMotivoBaixa] = useState('');
  const [salvandoBaixa, setSalvandoBaixa] = useState(false);

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

  const normalizarData = (dataStr: string) => {
    if (!dataStr) return '2000-01-02';
    let limpa = String(dataStr).trim();
    if (limpa.includes('/')) {
      const partes = limpa.split(' ')[0].split('/');
      if (partes.length === 3) return `${partes[2]}-${partes[1]}-${partes[0]}`;
    }
    return limpa.substring(0, 10);
  };

  const padronizarResina = (resStr: any, servicoStr: any = '') => {
    const r = normalizarTexto(resStr);
    const s = normalizarTexto(servicoStr);
    
    if (r.includes('TROPICAL') || s.includes('TROPICAL')) return 'TROPICAL';
    if (r.includes('HIBRIDO') || s.includes('HIBRIDO')) return 'HÍBRIDO';
    if (r.includes('ELLIOTTI') || r.includes('ELIOTI') || s.includes('ELLIOTTI') || s.includes('ELIOTI')) return 'ELLIOTTI';
    
    return '-';
  };

  const carregarEstoque = async () => {
    try {
      setLoading(prev => refreshing ? prev : true);

      const [entradas, anteriores, saidas, baixas, { data: mapa }] = await Promise.all([
        buscarTodasAsLinhas('diarios_campo'),
        buscarTodasAsLinhas('estoque_anterior'),
        buscarTodasAsLinhas('carregamentos'),
        buscarTodasAsLinhas('baixas_estoque'),
        supabase.from('mapa_fazendas').select('fazenda')
      ]);

      if (mapa) {
        const fazendasUnicas = [...new Set(mapa.map(m => normalizarNomeFazenda(m.fazenda)))].filter(Boolean);
        fazendasUnicas.sort();
        setListaFazendas(fazendasUnicas);
      }

      const mapaEstoque: Record<string, any> = {};

      const inicializarChave = (fzBruta: string, res: string) => {
        const fz = normalizarNomeFazenda(fzBruta);
        const resFinal = res === '-' ? 'ELLIOTTI' : res;
        const key = `${fz}|${resFinal}`;
        if (!mapaEstoque[key]) {
          mapaEstoque[key] = { 
            fazenda: fz, 
            resina: resFinal, 
            entradas: 0, 
            anterior: 0, 
            removidos: 0, 
            patioAnterior: 0,
            saidas: 0, 
            baixas: 0, 
            saldo: 0, 
            saldoBruto: 0,
            saldoPatio: 0,
            saldoMato: 0,
            historicoEntradas: [], 
            historicoRemocoes: [], 
            historicoSaidas: [] 
          };
        }
        return key;
      };

      // Identifica a resina principal da fazenda caso alguma remoção/carga não tenha variedade preenchida
      const resinaPadraoDaFazenda: Record<string, string> = {};
      (anteriores || []).forEach(item => {
        const fz = normalizarNomeFazenda(item.fazenda);
        const r = padronizarResina(item.tipo_resina);
        if (r !== '-') resinaPadraoDaFazenda[fz] = r;
      });
      (entradas || []).forEach(item => {
        const fz = normalizarNomeFazenda(item.fazenda);
        const r = padronizarResina(item.tipo_resina, item.servico);
        if (r !== '-' && !resinaPadraoDaFazenda[fz]) resinaPadraoDaFazenda[fz] = r;
      });

      const dataIniBD = converterDataParaBanco(dataInicial) || '2000-01-01';
      const dataFimBD = converterDataParaBanco(dataFinal) || '2100-12-31';
      const dtIniObj = new Date(`${dataIniBD}T00:00:00Z`);
      const dtFimObj = new Date(`${dataFimBD}T23:59:59Z`);

      // 1. Processar Saldo Inicial (estoque_anterior)
      (anteriores || []).forEach((item) => {
        const fz = normalizarNomeFazenda(item.fazenda);
        let res = padronizarResina(item.tipo_resina);
        if (res === '-') res = resinaPadraoDaFazenda[fz] || 'ELLIOTTI';

        const key = inicializarChave(fz, res);
        const qtd = arredondar(item.quantidade);
        
        mapaEstoque[key].anterior = arredondar(mapaEstoque[key].anterior + qtd);
        mapaEstoque[key].patioAnterior = arredondar(mapaEstoque[key].patioAnterior + qtd); 
      });

      // 2. Processar Coletas e Remoções (diarios_campo)
      (entradas || []).forEach((item) => {
        const servicoNorm = normalizarTexto(item.servico);
        const colabNorm = normalizarTexto(item.colaborador);

        const isColeta = servicoNorm.includes('COLETA') && !servicoNorm.includes('PREPARO') && !servicoNorm.includes('LIMPEZA');
        const isRemocao = servicoNorm.includes('REMO') || colabNorm.includes('REMOCAO');

        if (isColeta || isRemocao) {
          const fz = normalizarNomeFazenda(item.fazenda);
          let res = padronizarResina(item.tipo_resina, item.servico);
          if (res === '-') {
            const existingKey = Object.keys(mapaEstoque).find(k => k.startsWith(`${fz}|`) && !k.endsWith('|-'));
            res = existingKey ? existingKey.split('|')[1] : (resinaPadraoDaFazenda[fz] || 'ELLIOTTI');
          }

          const key = inicializarChave(fz, res);
          const qtd = arredondar(item.quantidade);
          const dataStr = normalizarData(item.data || item.created_at);
          const dataItemObj = new Date(`${dataStr}T12:00:00Z`);

          if (dataItemObj < dtIniObj) {
            if (isColeta) mapaEstoque[key].anterior = arredondar(mapaEstoque[key].anterior + qtd);
            if (isRemocao) mapaEstoque[key].patioAnterior = arredondar(mapaEstoque[key].patioAnterior + qtd);
          } else if (dataItemObj >= dtIniObj && dataItemObj <= dtFimObj) {
            if (isColeta) {
              mapaEstoque[key].entradas = arredondar(mapaEstoque[key].entradas + qtd);
              mapaEstoque[key].historicoEntradas.push({
                data: dataStr, 
                colaborador: item.colaborador || 'Não Identificado', 
                quadra: item.quadra || '-',
                ramal: item.ramal || '-',
                quantidade: qtd
              });
            }
            if (isRemocao) {
              mapaEstoque[key].removidos = arredondar(mapaEstoque[key].removidos + qtd);
              mapaEstoque[key].historicoRemocoes.push({
                data: dataStr, 
                colaborador: item.colaborador || 'Equipe de Remoção',
                quadra: item.quadra || '-', 
                ramal: item.ramal || '-',
                quantidade: qtd
              });
            }
          }
        }
      });

      // 3. Processar Saídas / Expedições (carregamentos)
      (saidas || []).forEach((item) => {
        if (item.tipo_carga && normalizarTexto(item.tipo_carga).includes('MADEIRA')) return;

        const fz = normalizarNomeFazenda(item.fazenda);
        let res = padronizarResina(item.variedade || item.tipo_resina);
        if (res === '-') {
          const existingKey = Object.keys(mapaEstoque).find(k => k.startsWith(`${fz}|`) && !k.endsWith('|-'));
          res = existingKey ? existingKey.split('|')[1] : (resinaPadraoDaFazenda[fz] || 'ELLIOTTI');
        }
        
        const key = inicializarChave(fz, res);
        const qtd = arredondar(item.quantidade);
        const dataStr = normalizarData(item.data_saida || item.data || item.created_at);
        const dataItemObj = new Date(`${dataStr}T12:00:00Z`);

        if (dataItemObj < dtIniObj) {
          mapaEstoque[key].anterior = arredondar(mapaEstoque[key].anterior - qtd);
          mapaEstoque[key].patioAnterior = arredondar(mapaEstoque[key].patioAnterior - qtd);
        } else if (dataItemObj >= dtIniObj && dataItemObj <= dtFimObj) {
          mapaEstoque[key].saidas = arredondar(mapaEstoque[key].saidas + qtd);
          mapaEstoque[key].historicoSaidas.push({
            data: dataStr,
            romaneio: item.numero_romaneio || item.romaneio || item.nf || item.placa || item.id || 'N/A',
            quantidade: qtd
          });
        }
      });

      // 4. Processar Baixas / Perdas (baixas_estoque)
      (baixas || []).forEach((item) => {
        const fz = normalizarNomeFazenda(item.fazenda);
        let res = padronizarResina(item.tipo_resina);
        if (res === '-') res = resinaPadraoDaFazenda[fz] || 'ELLIOTTI';

        const key = inicializarChave(fz, res);
        const qtd = arredondar(item.quantidade);
        const dataStr = normalizarData(item.created_at || item.data);
        const dataItemObj = new Date(`${dataStr}T12:00:00Z`);

        if (dataItemObj < dtIniObj) {
          mapaEstoque[key].anterior = arredondar(mapaEstoque[key].anterior - qtd);
        } else if (dataItemObj >= dtIniObj && dataItemObj <= dtFimObj) {
          mapaEstoque[key].baixas = arredondar(mapaEstoque[key].baixas + qtd);
        }
      });

      // 5. Consolidar os cartões e calcular Mato, Pátio e Total Geral
      const resultadoFinal = Object.values(mapaEstoque).map((item) => {
        const saldoBruto = arredondar((item.entradas + item.anterior) - (item.saidas + item.baixas));
        const saldo = saldoBruto < 0 ? 0 : Math.round(saldoBruto);

        let saldoPatio = arredondar(item.patioAnterior + item.removidos - item.saidas);
        if (saldoPatio < 0) saldoPatio = 0;
        if (saldo > 0 && saldoPatio > saldo) saldoPatio = saldo;
        if (saldo <= 0) saldoPatio = 0;

        let saldoMato = arredondar(saldo - saldoPatio);
        if (saldoMato < 0) saldoMato = 0;

        item.historicoEntradas.sort((a: any, b: any) => new Date(b.data).getTime() - new Date(a.data).getTime());
        item.historicoRemocoes.sort((a: any, b: any) => new Date(b.data).getTime() - new Date(a.data).getTime());
        item.historicoSaidas.sort((a: any, b: any) => new Date(b.data).getTime() - new Date(a.data).getTime());

        return { 
          ...item, 
          anterior: arredondar(item.anterior),
          entradas: arredondar(item.entradas),
          removidos: arredondar(item.removidos),
          saidas: arredondar(item.saidas),
          baixas: arredondar(item.baixas),
          saldoBruto,
          saldo, 
          saldoPatio: Math.round(saldoPatio),
          saldoMato: Math.round(saldoMato)
        };
      });

      const estoqueLimpo = resultadoFinal.filter(i => 
        i.saldo !== 0 || i.entradas !== 0 || i.saidas !== 0 || i.baixas !== 0 || i.anterior !== 0 || i.removidos !== 0
      );

      estoqueLimpo.sort((a, b) => {
        if (a.fazenda === b.fazenda) return b.saldo - a.saldo;
        return a.fazenda.localeCompare(b.fazenda);
      });

      let sumGlobal = 0;
      let sumPatio = 0;
      let sumMato = 0;
      let sumColetado = 0;
      let sumRemovido = 0;
      let sumExpedido = 0;
      let sumAnterior = 0;
      let sumBaixas = 0;

      estoqueLimpo.forEach(item => {
        sumGlobal += item.saldo;
        sumPatio += item.saldoPatio;
        sumMato += item.saldoMato;
        sumColetado += item.entradas;
        sumRemovido += item.removidos;
        sumExpedido += item.saidas;
        sumAnterior += item.anterior;
        sumBaixas += item.baixas;
      });

      setEstoque(estoqueLimpo);
      setTotalGlobal(arredondar(sumGlobal));
      setTotalPatioGlobal(arredondar(sumPatio));
      setTotalMatoGlobal(arredondar(sumMato));
      setTotalColetadoGlobal(arredondar(sumColetado));
      setTotalRemovidoGlobal(arredondar(sumRemovido));
      setTotalExpedidoGlobal(arredondar(sumExpedido));
      setTotalAnteriorGlobal(arredondar(sumAnterior));
      setTotalBaixasGlobal(arredondar(sumBaixas));

    } catch (error: any) {
      console.log('Erro ao calcular estoque:', error);
      Alert.alert(
        "Erro ao carregar dados", 
        error instanceof Error ? error.message : JSON.stringify(error)
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    carregarEstoque();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    carregarEstoque();
  };

  const salvarEstoqueAnterior = async () => {
    if (!fazendaAnterior || !resinaAnterior || !quantidadeAnterior) {
      return Alert.alert("Aviso", "Preencha todos os campos!");
    }
    setSalvandoAnterior(true);
    try {
      const { error } = await supabase.from('estoque_anterior').insert([{
        fazenda: normalizarNomeFazenda(fazendaAnterior),
        tipo_resina: resinaAnterior,
        quantidade: parseFloat(quantidadeAnterior.replace(',', '.')) || 0
      }]);
      if (error) throw error;
      Alert.alert("Sucesso", "Saldo inicial adicionado com sucesso!");
      setModalAnteriorVisivel(false);
      setQuantidadeAnterior('');
      setFazendaAnterior('');
      carregarEstoque();
    } catch (e) {
      Alert.alert("Erro", "Não foi possível salvar o saldo inicial.");
    } finally {
      setSalvandoAnterior(false);
    }
  };

  const salvarBaixaEstoque = async () => {
    if (!fazendaBaixa || !resinaBaixa || !quantidadeBaixa || !motivoBaixa) {
      return Alert.alert("Aviso", "Preencha todos os campos, incluindo o motivo da baixa!");
    }
    setSalvandoBaixa(true);
    try {
      const { error } = await supabase.from('baixas_estoque').insert([{
        fazenda: normalizarNomeFazenda(fazendaBaixa),
        tipo_resina: resinaBaixa,
        quantidade: parseFloat(quantidadeBaixa.replace(',', '.')) || 0,
        motivo: motivoBaixa
      }]);
      if (error) throw error;
      Alert.alert("Sucesso", "Baixa registrada! O saldo foi ajustado.");
      setModalBaixaVisivel(false);
      setQuantidadeBaixa('');
      setMotivoBaixa('');
      setFazendaBaixa('');
      carregarEstoque();
    } catch (e) {
      Alert.alert("Erro", "Não foi possível registrar a baixa.");
    } finally {
      setSalvandoBaixa(false);
    }
  };

  const estoqueFiltrado = estoque.filter(item => {
    if (filtroResina === 'TODAS') return true;
    return item.resina === filtroResina;
  });

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#27AE60" />
        <Text style={{ marginTop: 10, color: '#34495E', fontWeight: 'bold' }}>Calculando Estoque e Remoções...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* CABEÇALHO */}
      <View style={styles.headerDashboard}>
        <View>
          <Text style={styles.tituloPainel}>Painel de Estoque</Text>
          <Text style={styles.descricaoPainel}>Controle Completo: Mato, Remoção e Pátio</Text>
        </View>
        <TouchableOpacity style={styles.botaoAtualizar} onPress={onRefresh} activeOpacity={0.7}>
          <Ionicons name="refresh" size={18} color="#FFF" style={{ marginRight: 5 }} />
          <Text style={styles.textoBotao}>Atualizar</Text>
        </TouchableOpacity>
      </View>

      {/* FILTRO POR DATA */}
      <View style={styles.cardFiltros}>
        <Text style={styles.labelFiltro}>Pesquisar por Período (Deixe em branco para ver todo o histórico):</Text>
        <View style={styles.rowFiltro}>
          <View style={[styles.colFiltro, { flex: 1, marginRight: 10 }]}>
            <TextInput
              style={styles.inputFiltro}
              value={dataInicial}
              onChangeText={t => aplicarMascaraData(t, setDataInicial)}
              placeholder="Data Inicial"
              keyboardType="numeric"
              maxLength={10}
            />
          </View>
          <View style={[styles.colFiltro, { flex: 1, marginRight: 10 }]}>
            <TextInput
              style={styles.inputFiltro}
              value={dataFinal}
              onChangeText={t => aplicarMascaraData(t, setDataFinal)}
              placeholder="Data Final"
              keyboardType="numeric"
              maxLength={10}
            />
          </View>
          <TouchableOpacity style={styles.btnFiltrar} onPress={carregarEstoque}>
            <Ionicons name="search" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* BOTÕES DE AÇÃO (SALDO INICIAL E BAIXA) */}
      <View style={styles.containerBotoesAcao}>
        <TouchableOpacity style={[styles.botaoAjuste, { backgroundColor: '#8E44AD' }]} onPress={() => setModalAnteriorVisivel(true)}>
          <Ionicons name="add-circle-outline" size={20} color="#FFF" style={{ marginRight: 5 }} />
          <Text style={styles.textoBotaoAjuste}>Lançar Saldo Inicial</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.botaoAjuste, { backgroundColor: '#E74C3C' }]} onPress={() => setModalBaixaVisivel(true)}>
          <Ionicons name="remove-circle-outline" size={20} color="#FFF" style={{ marginRight: 5 }} />
          <Text style={styles.textoBotaoAjuste}>Dar Baixa (Perda)</Text>
        </TouchableOpacity>
      </View>

      {/* PAINEL EXECUTIVO GLOBAL (RESUMO DE TODAS AS FAZENDAS) */}
      <View style={styles.cardGlobalContainer}>
        <Text style={styles.tituloSecaoGlobal}>📊 RESUMO GERAL DE TODAS AS FAZENDAS</Text>
        
        {/* Linha 1: Movimentações Acumuladas */}
        <View style={styles.gridGlobalMovimentacoes}>
          <View style={styles.boxGlobalMini}>
            <Text style={styles.labelGlobalMini}>Anterior</Text>
            <Text style={[styles.valorGlobalMini, { color: '#D2B4DE' }]}>{formatarQtd(totalAnteriorGlobal)}</Text>
          </View>
          <View style={styles.boxGlobalMini}>
            <Text style={styles.labelGlobalMini}>Coletados</Text>
            <Text style={[styles.valorGlobalMini, { color: '#82E0AA' }]}>+ {formatarQtd(totalColetadoGlobal)}</Text>
          </View>
          <View style={[styles.boxGlobalMini, { backgroundColor: 'rgba(52, 152, 219, 0.25)', borderColor: '#5DADE2' }]}>
            <Text style={[styles.labelGlobalMini, { color: '#AED6F1' }]}>🚜 Removidos</Text>
            <Text style={[styles.valorGlobalMini, { color: '#FFF' }]}>+ {formatarQtd(totalRemovidoGlobal)}</Text>
          </View>
          <View style={styles.boxGlobalMini}>
            <Text style={styles.labelGlobalMini}>Expedidos</Text>
            <Text style={[styles.valorGlobalMini, { color: '#F5B041' }]}>- {formatarQtd(totalExpedidoGlobal)}</Text>
          </View>
        </View>

        {/* Linha 2: Saldos Físicos Atuais */}
        <View style={styles.barraGlobalSaldos}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.tituloGlobal}>🌲 No Mato</Text>
            <Text style={styles.valorGlobal}>{formatarQtd(totalMatoGlobal)} un</Text>
          </View>
          <View style={styles.divisorGlobal} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.tituloGlobal}>🚜 Nos Pátios</Text>
            <Text style={[styles.valorGlobal, { color: '#85C1E9' }]}>{formatarQtd(totalPatioGlobal)} un</Text>
          </View>
          <View style={styles.divisorGlobal} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.tituloGlobal}>📦 Total Geral</Text>
            <Text style={[styles.valorGlobal, { color: '#F1C40F' }]}>{formatarQtd(totalGlobal)} un</Text>
          </View>
        </View>
      </View>

      {/* FILTRO RÁPIDO POR TIPO DE RESINA */}
      <View style={styles.abasResinaContainer}>
        {['TODAS', 'ELLIOTTI', 'TROPICAL', 'HÍBRIDO'].map((aba) => (
          <TouchableOpacity
            key={aba}
            style={[styles.abaResina, filtroResina === aba && styles.abaResinaAtiva]}
            onPress={() => setFiltroResina(aba)}
          >
            <Text style={[styles.textoAbaResina, filtroResina === aba && styles.textoAbaResinaAtiva]}>
              {aba}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.subtitulo}>Detalhamento por Fazenda ({estoqueFiltrado.length})</Text>

      {estoqueFiltrado.length === 0 ? (
        <Text style={styles.emptyText}>Nenhuma movimentação registrada para este filtro.</Text>
      ) : (
        estoqueFiltrado.map((item, index) => (
          <FazendaEstoqueCard key={`${item.fazenda}-${item.resina}-${index}`} item={item} />
        ))
      )}
      
      <View style={{ height: 80 }} />

      {/* MODAL SALDO INICIAL */}
      <Modal visible={modalAnteriorVisivel} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Lançar Estoque Anterior</Text>
            <Text style={styles.modalSub}>Adicione tambores que já estavam na fazenda antes do uso do aplicativo.</Text>

            <Text style={styles.labelModal}>Fazenda:</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={fazendaAnterior} onValueChange={setFazendaAnterior} style={styles.picker}>
                <Picker.Item label="Selecione..." value="" />
                {listaFazendas.map((fz, i) => <Picker.Item key={i} label={fz} value={fz} />)}
              </Picker>
            </View>

            <Text style={styles.labelModal}>Tipo de Resina:</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={resinaAnterior} onValueChange={setResinaAnterior} style={styles.picker}>
                <Picker.Item label="ELLIOTTI" value="ELLIOTTI" />
                <Picker.Item label="TROPICAL" value="TROPICAL" />
                <Picker.Item label="HÍBRIDO" value="HÍBRIDO" />
              </Picker>
            </View>

            <Text style={styles.labelModal}>Qtd Tambores (Saldo Inicial):</Text>
            <TextInput style={styles.inputModal} placeholder="Ex: 50" keyboardType="numeric" value={quantidadeAnterior} onChangeText={setQuantidadeAnterior} />

            <View style={styles.rowBotoes}>
              <TouchableOpacity style={[styles.btnModal, { backgroundColor: '#95A5A6' }]} onPress={() => setModalAnteriorVisivel(false)}>
                <Text style={styles.textoBotao}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnModal, { backgroundColor: '#27AE60' }]} onPress={salvarEstoqueAnterior} disabled={salvandoAnterior}>
                {salvandoAnterior ? <ActivityIndicator color="#FFF" /> : <Text style={styles.textoBotao}>Salvar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL BAIXA / PERDA */}
      <Modal visible={modalBaixaVisivel} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Registrar Baixa / Perda</Text>
            <Text style={styles.modalSub}>Retire tambores perdidos do estoque sem afetar o pagamento dos funcionários.</Text>

            <Text style={styles.labelModal}>Fazenda:</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={fazendaBaixa} onValueChange={setFazendaBaixa} style={styles.picker}>
                <Picker.Item label="Selecione..." value="" />
                {listaFazendas.map((fz, i) => <Picker.Item key={i} label={fz} value={fz} />)}
              </Picker>
            </View>

            <Text style={styles.labelModal}>Tipo de Resina:</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={resinaBaixa} onValueChange={setResinaBaixa} style={styles.picker}>
                <Picker.Item label="ELLIOTTI" value="ELLIOTTI" />
                <Picker.Item label="TROPICAL" value="TROPICAL" />
                <Picker.Item label="HÍBRIDO" value="HÍBRIDO" />
              </Picker>
            </View>

            <Text style={styles.labelModal}>Qtd de Tambores Perdidos:</Text>
            <TextInput style={styles.inputModal} placeholder="Ex: 2" keyboardType="numeric" value={quantidadeBaixa} onChangeText={setQuantidadeBaixa} />

            <Text style={styles.labelModal}>Motivo (Obrigatório):</Text>
            <TextInput style={styles.inputModal} placeholder="Ex: Tambor furou, Acidente no trator..." value={motivoBaixa} onChangeText={setMotivoBaixa} />

            <View style={styles.rowBotoes}>
              <TouchableOpacity style={[styles.btnModal, { backgroundColor: '#95A5A6' }]} onPress={() => setModalBaixaVisivel(false)}>
                <Text style={styles.textoBotao}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnModal, { backgroundColor: '#E74C3C' }]} onPress={salvarBaixaEstoque} disabled={salvandoBaixa}>
                {salvandoBaixa ? <ActivityIndicator color="#FFF" /> : <Text style={styles.textoBotao}>Dar Baixa</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8', padding: 15 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F6F8' },
  headerDashboard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, marginTop: 5 },
  tituloPainel: { fontSize: 22, fontWeight: 'bold', color: '#2C3E50' },
  descricaoPainel: { fontSize: 13, color: '#7F8C8D' },
  
  botaoAtualizar: { backgroundColor: '#2980B9', flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 8, elevation: 2 },
  
  cardFiltros: { backgroundColor: '#FFF', padding: 15, borderRadius: 10, elevation: 2, marginBottom: 15, borderWidth: 1, borderColor: '#E0E6ED' },
  labelFiltro: { fontSize: 12, fontWeight: 'bold', color: '#7F8C8D', marginBottom: 8 },
  rowFiltro: { flexDirection: 'row', alignItems: 'center' },
  colFiltro: { flex: 1 },
  inputFiltro: { borderWidth: 1, borderColor: '#BDC3C7', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#F8FAFC', color: '#2C3E50' },
  btnFiltrar: { backgroundColor: '#2980B9', padding: 12, borderRadius: 8, justifyContent: 'center', alignItems: 'center', width: 50, height: 42 },

  containerBotoesAcao: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  botaoAjuste: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8, elevation: 2, width: '48%' },
  textoBotaoAjuste: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  textoBotao: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  
  // PAINEL EXECUTIVO GLOBAL
  cardGlobalContainer: { backgroundColor: '#1E293B', borderRadius: 14, padding: 15, elevation: 4, marginBottom: 20 },
  tituloSecaoGlobal: { color: '#94A3B8', fontSize: 11, fontWeight: 'bold', textAlign: 'center', marginBottom: 12, letterSpacing: 0.5 },
  gridGlobalMovimentacoes: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  boxGlobalMini: { width: '23.5%', backgroundColor: 'rgba(255,255,255,0.07)', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  labelGlobalMini: { color: '#CBD5E1', fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 },
  valorGlobalMini: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  barraGlobalSaldos: { backgroundColor: '#0F172A', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' },
  divisorGlobal: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 8, height: 32 },
  tituloGlobal: { color: '#94A3B8', fontSize: 10, fontWeight: 'bold', marginBottom: 4, textTransform: 'uppercase' },
  valorGlobal: { color: '#2ECC71', fontSize: 18, fontWeight: '900' },

  // ABAS DE FILTRO DE RESINA
  abasResinaContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18, gap: 6 },
  abaResina: { flex: 1, backgroundColor: '#FFF', paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#D5DBDB' },
  abaResinaAtiva: { backgroundColor: '#2980B9', borderColor: '#2980B9' },
  textoAbaResina: { fontSize: 11, fontWeight: 'bold', color: '#34495E' },
  textoAbaResinaAtiva: { color: '#FFF' },
  
  subtitulo: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50', marginBottom: 12, marginLeft: 4 },
  
  // CARD DA FAZENDA
  cardFazenda: { backgroundColor: '#FFF', borderRadius: 12, padding: 15, marginBottom: 16, elevation: 3, borderLeftWidth: 5, borderLeftColor: '#2980B9' },
  headerFazenda: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#ECF0F1', paddingBottom: 12 },
  iconeFazendaBox: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#2C3E50', justifyContent: 'center', alignItems: 'center' },
  nomeFazenda: { fontSize: 17, fontWeight: 'bold', color: '#2C3E50' },
  
  badgeResina: { backgroundColor: '#F39C12', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  textoBadgeResina: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  badgeStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  textoBadgeStatus: { fontSize: 10, fontWeight: 'bold' },

  secaoCardTitulo: { fontSize: 10, fontWeight: 'bold', color: '#7F8C8D', marginBottom: 6, marginTop: 2, letterSpacing: 0.4 },
  linhaValores: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 8 },
  colunaValor3: { alignItems: 'center', width: '31.5%', backgroundColor: '#F8FAFC', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E0E6ED', marginBottom: 6 },
  colunaValor2: { alignItems: 'center', width: '48.5%', paddingVertical: 12, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  labelValor: { fontSize: 10, color: '#7F8C8D', marginBottom: 4, fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center' },
  textoValor: { fontSize: 16, fontWeight: '800' },
  textoValorDestaque: { fontSize: 18, fontWeight: '900' },
  
  containerSaldos: { marginTop: 4 },
  barraSaldo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, borderRadius: 8, borderWidth: 1 },
  labelSaldoTotal: { fontSize: 11, fontWeight: 'bold' },
  valorSaldoTotal: { fontSize: 16, fontWeight: '900' },

  botoesHistoricoContainer: { marginTop: 14 },
  btnToggleHistorico: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  txtToggleHistorico: { fontWeight: 'bold', fontSize: 12, marginLeft: 6 },
  containerHistorico: { marginTop: 6, backgroundColor: '#FFF', borderRadius: 8, padding: 10, borderWidth: 1 },
  tituloHistorico: { fontSize: 12, fontWeight: 'bold', color: '#34495E', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EAEDED', paddingBottom: 5 },
  itemHistorico: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, backgroundColor: '#F8FAFC', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#E0E6ED' },
  historicoIcone: { marginRight: 10 },
  historicoDados: { flex: 1 },
  historicoData: { fontSize: 11, color: '#7F8C8D', fontWeight: '600' },
  historicoRomaneio: { fontSize: 12, color: '#34495E', marginTop: 2 },
  historicoQtd: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  historicoQtdValor: { fontWeight: 'bold', fontSize: 12 },

  emptyText: { textAlign: 'center', color: '#7F8C8D', marginTop: 35, fontSize: 15 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', width: '100%', borderRadius: 15, padding: 20, elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50', textAlign: 'center' },
  modalSub: { fontSize: 12, color: '#7F8C8D', textAlign: 'center', marginBottom: 20, marginTop: 5 },
  labelModal: { fontSize: 13, fontWeight: 'bold', color: '#34495E', marginBottom: 5, marginTop: 10 },
  inputModal: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#F8FAFC' },
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', overflow: 'hidden', height: 50, justifyContent: 'center' },
  picker: { height: 50, width: '100%', borderWidth: 0, backgroundColor: 'transparent' },
  rowBotoes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25, gap: 10 },
  btnModal: { flex: 1, paddingVertical: 15, borderRadius: 8, alignItems: 'center' }
});