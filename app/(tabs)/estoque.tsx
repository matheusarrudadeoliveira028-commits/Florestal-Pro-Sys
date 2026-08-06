import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import React, { memo, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

// =========================================================================
// 🟢 COMPONENTE ISOLADO: CARD DA FAZENDA COM HISTÓRICO EXPANSÍVEL
// =========================================================================
const FazendaEstoqueCard = memo(({ item }: { item: any }) => {
  const [expandidoEntradas, setExpandidoEntradas] = useState(false);
  const [expandidoSaidas, setExpandidoSaidas] = useState(false);

  return (
    <View style={styles.cardFazenda}>
      <View style={styles.headerFazenda}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <MaterialCommunityIcons name="pine-tree" size={24} color="#2C3E50" />
          <View style={{marginLeft: 10}}>
            <Text style={styles.nomeFazenda}>{item.fazenda}</Text>
            <View style={styles.badgeResina}>
              <Text style={styles.textoBadgeResina}>{item.resina}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.linhaValores}>
        <View style={styles.colunaValor}>
          <Text style={styles.labelValor}>Estoque Ant.</Text>
          <Text style={[styles.textoValor, { color: '#8E44AD' }]}>{item.anterior}</Text>
        </View>
        <View style={styles.colunaValor}>
          <Text style={styles.labelValor}>Coletados</Text>
          <Text style={[styles.textoValor, { color: '#27AE60' }]}>+ {item.entradas}</Text>
        </View>
        <View style={styles.colunaValor}>
          <Text style={styles.labelValor}>Expedidos</Text>
          <Text style={[styles.textoValor, { color: '#E67E22' }]}>- {item.saidas}</Text>
        </View>
        <View style={styles.colunaValor}>
          <Text style={styles.labelValor}>Perdas (Baixa)</Text>
          <Text style={[styles.textoValor, { color: '#E74C3C' }]}>- {item.baixas}</Text>
        </View>
      </View>

      {/* BARRA DE SALDO DESTAQUE */}
      <View style={[styles.barraSaldo, { backgroundColor: item.saldo < 0 ? '#FDEDEC' : '#E8F8F5', borderColor: item.saldo < 0 ? '#FADBD8' : '#D5F5E3' }]}>
        <Text style={[styles.labelSaldoTotal, { color: item.saldo < 0 ? '#C0392B' : '#1E8449' }]}>SALDO ATUAL:</Text>
        <Text style={[styles.valorSaldoTotal, { color: item.saldo < 0 ? '#E74C3C' : '#27AE60' }]}>
          {item.saldo} Tambores
        </Text>
      </View>

      <View style={styles.botoesHistoricoContainer}>
        {/* 🟢 BOTÃO PARA ABRIR O HISTÓRICO DE ENTRADAS */}
        {item.historicoEntradas && item.historicoEntradas.length > 0 && (
          <View style={{ marginBottom: 10 }}>
            <TouchableOpacity 
              style={[styles.btnToggleHistorico, { backgroundColor: '#E8F8F5', borderColor: '#A9DFBF' }]} 
              onPress={() => setExpandidoEntradas(!expandidoEntradas)}
            >
              <Ionicons name={expandidoEntradas ? "chevron-up" : "chevron-down"} size={16} color="#27AE60" />
              <Text style={[styles.txtToggleHistorico, { color: '#27AE60' }]}>
                {expandidoEntradas ? "Ocultar Histórico de Coletas" : "Ver Histórico de Coletas"}
              </Text>
            </TouchableOpacity>

            {expandidoEntradas && (
              <View style={[styles.containerHistorico, { borderColor: '#A9DFBF' }]}>
                <Text style={styles.tituloHistorico}>📥 Detalhamento de Coletas (Entradas)</Text>
                {item.historicoEntradas.map((entrada: any, idx: number) => {
                  let dataFormatada = 'Data N/I';
                  if (entrada.data) {
                    const d = entrada.data.split('T')[0].split('-');
                    if (d.length === 3) dataFormatada = `${d[2]}/${d[1]}/${d[0]}`;
                  }

                  return (
                    <View key={`ent-${idx}`} style={styles.itemHistorico}>
                      <View style={styles.historicoIcone}>
                        <Ionicons name="arrow-down-circle" size={20} color="#27AE60" />
                      </View>
                      <View style={styles.historicoDados}>
                        <Text style={styles.historicoData}>{dataFormatada}</Text>
                        <Text style={styles.historicoRomaneio}>Colaborador: <Text style={{fontWeight: 'bold', color: '#2C3E50'}}>{entrada.colaborador}</Text></Text>
                      </View>
                      <View style={[styles.historicoQtd, { backgroundColor: '#E8F8F5' }]}>
                        <Text style={[styles.historicoQtdValor, { color: '#27AE60' }]}>+ {entrada.quantidade} tbrs</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* 🟢 BOTÃO PARA ABRIR O HISTÓRICO DE SAÍDAS */}
        {item.historicoSaidas && item.historicoSaidas.length > 0 && (
          <View>
            <TouchableOpacity 
              style={[styles.btnToggleHistorico, { backgroundColor: '#FEF5E7', borderColor: '#F5CBA7' }]} 
              onPress={() => setExpandidoSaidas(!expandidoSaidas)}
            >
              <Ionicons name={expandidoSaidas ? "chevron-up" : "chevron-down"} size={16} color="#E67E22" />
              <Text style={[styles.txtToggleHistorico, { color: '#E67E22' }]}>
                {expandidoSaidas ? "Ocultar Histórico de Expedições" : "Ver Histórico de Expedições"}
              </Text>
            </TouchableOpacity>

            {expandidoSaidas && (
              <View style={[styles.containerHistorico, { borderColor: '#F5CBA7' }]}>
                <Text style={styles.tituloHistorico}>🚚 Detalhamento de Expedições (Saídas)</Text>
                {item.historicoSaidas.map((saida: any, idx: number) => {
                  let dataFormatada = 'Data N/I';
                  if (saida.data) {
                    const d = saida.data.split('T')[0].split('-');
                    if (d.length === 3) dataFormatada = `${d[2]}/${d[1]}/${d[0]}`;
                  }

                  return (
                    <View key={`sai-${idx}`} style={styles.itemHistorico}>
                      <View style={styles.historicoIcone}>
                        <Ionicons name="arrow-undo-circle" size={20} color="#E67E22" />
                      </View>
                      <View style={styles.historicoDados}>
                        <Text style={styles.historicoData}>{dataFormatada}</Text>
                        <Text style={styles.historicoRomaneio}>ID/Romaneio: <Text style={{fontWeight: 'bold', color: '#2C3E50'}}>{saida.romaneio}</Text></Text>
                      </View>
                      <View style={[styles.historicoQtd, { backgroundColor: '#FDEDEC' }]}>
                        <Text style={[styles.historicoQtdValor, { color: '#C0392B' }]}>- {saida.quantidade} tbrs</Text>
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
// TELA PRINCIPAL
// =========================================================================
export default function EstoqueDashboard() {
  const [estoque, setEstoque] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalGlobal, setTotalGlobal] = useState(0);

  // Estados para o Filtro de Data
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');

  // Estados para Modais
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

  const carregarEstoque = async () => {
    try {
      setLoading(prev => refreshing ? prev : true);

      const { data: entradas, error: errEntradas } = await supabase.from('diarios_campo').select('*');
      const { data: anteriores, error: errAnteriores } = await supabase.from('estoque_anterior').select('*');
      const { data: saidas, error: errSaidas } = await supabase.from('carregamentos').select('*');
      const { data: baixas, error: errBaixas } = await supabase.from('baixas_estoque').select('*');

      const { data: mapa } = await supabase.from('mapa_fazendas').select('fazenda');
      if (mapa) {
        setListaFazendas([...new Set(mapa.map(m => m.fazenda))] as string[]);
      }

      if (errEntradas || errSaidas || errAnteriores || errBaixas) throw new Error('Erro ao buscar dados');

      const mapaEstoque: Record<string, any> = {};

      const inicializarChave = (fz: string, res: string) => {
        const key = `${fz}|${res}`;
        if (!mapaEstoque[key]) {
          mapaEstoque[key] = { 
            fazenda: fz, resina: res, entradas: 0, anterior: 0, 
            saidas: 0, baixas: 0, saldo: 0, historicoEntradas: [], historicoSaidas: [] 
          };
        }
        return key;
      };

      const dataIniBD = converterDataParaBanco(dataInicial) || '2000-01-01';
      const dataFimBD = converterDataParaBanco(dataFinal) || '2100-12-31';
      const dtIniObj = new Date(`${dataIniBD}T00:00:00Z`);
      const dtFimObj = new Date(`${dataFimBD}T23:59:59Z`);

      (anteriores || []).forEach((item) => {
        const fz = item.fazenda ? item.fazenda.trim() : 'Sem Fazenda';
        const res = item.tipo_resina || 'INDEFINIDA';
        const key = inicializarChave(fz, res);
        mapaEstoque[key].anterior += Number(item.quantidade) || 0;
      });

      (entradas || []).forEach((item) => {
        const nomeServico = item.servico ? String(item.servico).toLowerCase() : '';
        if (nomeServico.includes('coleta')) {
          const fz = item.fazenda ? item.fazenda.trim() : 'Sem Fazenda';
          
          let res = item.tipo_resina;
          if (!res && item.servico && String(item.servico).includes('-')) {
            res = String(item.servico).split('-').pop()?.trim().toUpperCase();
          }
          res = res || 'INDEFINIDA';
          
          const key = inicializarChave(fz, res);
          const qtd = Number(item.quantidade) || 0;

          const dataItemStr = normalizarData(item.data || item.created_at);
          const dataItemObj = new Date(`${dataItemStr}T12:00:00Z`);

          if (dataItemObj < dtIniObj) {
            mapaEstoque[key].anterior += qtd;
          } else if (dataItemObj >= dtIniObj && dataItemObj <= dtFimObj) {
            mapaEstoque[key].entradas += qtd;
            mapaEstoque[key].historicoEntradas.push({
              data: dataItemStr,
              colaborador: item.colaborador || 'Não Identificado',
              quantidade: qtd
            });
          }
        }
      });

      (saidas || []).forEach((item) => {
        // 🟢 REGRA ADICIONADA: Ignora completamente os carregamentos de Madeira!
        if (item.tipo_carga && String(item.tipo_carga).toUpperCase() === 'MADEIRA') return;

        const fz = item.fazenda ? item.fazenda.trim() : 'Sem Fazenda';
        let res = item.variedade ? String(item.variedade).trim().toUpperCase() : 'INDEFINIDA';
        const key = inicializarChave(fz, res);
        const qtd = Number(item.quantidade) || 0;
        
        const dataItemStr = normalizarData(item.data_saida || item.data || item.created_at);
        const dataItemObj = new Date(`${dataItemStr}T12:00:00Z`);

        if (dataItemObj < dtIniObj) {
            mapaEstoque[key].anterior -= qtd;
        } else if (dataItemObj >= dtIniObj && dataItemObj <= dtFimObj) {
            mapaEstoque[key].saidas += qtd;
            mapaEstoque[key].historicoSaidas.push({
              data: dataItemStr,
              romaneio: item.numero_romaneio || item.romaneio || item.nf || item.placa || item.id || 'N/A',
              quantidade: qtd
            });
        }
      });

      (baixas || []).forEach((item) => {
        const fz = item.fazenda ? item.fazenda.trim() : 'Sem Fazenda';
        const res = item.tipo_resina || 'INDEFINIDA';
        const key = inicializarChave(fz, res);
        const qtd = Number(item.quantidade) || 0;

        const dataItemStr = normalizarData(item.created_at || item.data);
        const dataItemObj = new Date(`${dataItemStr}T12:00:00Z`);

        if (dataItemObj < dtIniObj) {
            mapaEstoque[key].anterior -= qtd;
        } else if (dataItemObj >= dtIniObj && dataItemObj <= dtFimObj) {
            mapaEstoque[key].baixas += qtd;
        }
      });

      let total = 0;
      const resultadoFinal = Object.values(mapaEstoque).map((item) => {
        const saldo = (item.entradas + item.anterior) - (item.saidas + item.baixas);
        total += saldo;

        item.historicoEntradas.sort((a: any, b: any) => {
          if (!a.data || !b.data) return 0;
          return new Date(b.data).getTime() - new Date(a.data).getTime();
        });

        item.historicoSaidas.sort((a: any, b: any) => {
          if (!a.data || !b.data) return 0;
          return new Date(b.data).getTime() - new Date(a.data).getTime();
        });

        return { ...item, saldo };
      });

      // 🟢 Oculta os cartões que não tiveram nenhuma movimentação e saldo zero (pra limpar a tela)
      const estoqueLimpo = resultadoFinal.filter(i => i.saldo !== 0 || i.entradas !== 0 || i.saidas !== 0 || i.baixas !== 0 || i.anterior !== 0);

      estoqueLimpo.sort((a, b) => {
        if (a.fazenda === b.fazenda) return b.saldo - a.saldo;
        return a.fazenda.localeCompare(b.fazenda);
      });

      setEstoque(estoqueLimpo);
      setTotalGlobal(total);
    } catch (error) {
      console.log('Erro ao calcular estoque:', error);
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
        fazenda: fazendaAnterior,
        tipo_resina: resinaAnterior,
        quantidade: parseInt(quantidadeAnterior)
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
        fazenda: fazendaBaixa,
        tipo_resina: resinaBaixa,
        quantidade: parseInt(quantidadeBaixa),
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

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#27AE60" />
        <Text style={{ marginTop: 10, color: '#34495E', fontWeight: 'bold' }}>Calculando Estoque...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerDashboard}>
        <View>
          <Text style={styles.tituloPainel}>Painel de Estoque</Text>
          <Text style={styles.descricaoPainel}>Controle por Fazenda e Resina</Text>
        </View>
        <TouchableOpacity style={styles.botaoAtualizar} onPress={onRefresh} activeOpacity={0.7}>
          <Ionicons name="refresh" size={18} color="#FFF" style={{ marginRight: 5 }} />
          <Text style={styles.textoBotao}>Atualizar</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cardFiltros}>
        <Text style={styles.labelFiltro}>Pesquisar por Data (Deixe em branco para ver tudo):</Text>
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

      <View style={styles.containerBotoesAcao}>
        <TouchableOpacity style={[styles.botaoAjuste, {backgroundColor: '#8E44AD'}]} onPress={() => setModalAnteriorVisivel(true)}>
          <Ionicons name="add-circle-outline" size={20} color="#FFF" style={{ marginRight: 5 }} />
          <Text style={styles.textoBotaoAjuste}>Saldo Inicial</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.botaoAjuste, {backgroundColor: '#E74C3C'}]} onPress={() => setModalBaixaVisivel(true)}>
          <Ionicons name="remove-circle-outline" size={20} color="#FFF" style={{ marginRight: 5 }} />
          <Text style={styles.textoBotaoAjuste}>Dar Baixa (Perda)</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cardGlobal}>
        <Ionicons name="cube" size={40} color="#FFF" />
        <View style={{ marginLeft: 15 }}>
          <Text style={styles.tituloGlobal}>Estoque Global Disponível</Text>
          <Text style={styles.valorGlobal}>{totalGlobal.toLocaleString('pt-BR')} Tambores</Text>
        </View>
      </View>

      <Text style={styles.subtitulo}>Detalhamento do Estoque</Text>

      {estoque.length === 0 ? (
        <Text style={styles.emptyText}>Nenhuma movimentação registrada nas tabelas.</Text>
      ) : (
        estoque.map((item, index) => (
          <FazendaEstoqueCard key={index} item={item} />
        ))
      )}
      
      <View style={{ height: 80 }} />

      {/* MODAIS */}
      <Modal visible={modalAnteriorVisivel} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Lançar Estoque Anterior</Text>
            <Text style={styles.modalSub}>Adicione tambores que já estavam na fazenda antes do app.</Text>

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
              <TouchableOpacity style={[styles.btnModal, {backgroundColor: '#95A5A6'}]} onPress={() => setModalAnteriorVisivel(false)}>
                <Text style={styles.textoBotao}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnModal, {backgroundColor: '#27AE60'}]} onPress={salvarEstoqueAnterior} disabled={salvandoAnterior}>
                {salvandoAnterior ? <ActivityIndicator color="#FFF" /> : <Text style={styles.textoBotao}>Salvar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={modalBaixaVisivel} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Registrar Baixa / Perda</Text>
            <Text style={styles.modalSub}>Retire tambores do estoque sem alterar os pagamentos dos funcionários.</Text>

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
              <TouchableOpacity style={[styles.btnModal, {backgroundColor: '#95A5A6'}]} onPress={() => setModalBaixaVisivel(false)}>
                <Text style={styles.textoBotao}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnModal, {backgroundColor: '#E74C3C'}]} onPress={salvarBaixaEstoque} disabled={salvandoBaixa}>
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

  containerBotoesAcao: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  botaoAjuste: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8, elevation: 2, width: '48%' },
  textoBotaoAjuste: { color: '#FFF', fontWeight: 'bold', fontSize: 11 },
  textoBotao: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  
  cardGlobal: { backgroundColor: '#27AE60', borderRadius: 12, padding: 20, flexDirection: 'row', alignItems: 'center', elevation: 4, marginBottom: 25 },
  tituloGlobal: { color: '#E8F8F5', fontSize: 16, fontWeight: '600' },
  valorGlobal: { color: '#FFF', fontSize: 28, fontWeight: 'bold' },
  
  subtitulo: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50', marginBottom: 15, marginLeft: 5 },
  
  cardFazenda: { backgroundColor: '#FFF', borderRadius: 10, padding: 15, marginBottom: 15, elevation: 2, borderLeftWidth: 5, borderLeftColor: '#2980B9' },
  headerFazenda: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#ECF0F1', paddingBottom: 10 },
  nomeFazenda: { fontSize: 17, fontWeight: 'bold', color: '#2C3E50' },
  
  badgeResina: { backgroundColor: '#F39C12', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, marginTop: 4, alignSelf: 'flex-start' },
  textoBadgeResina: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },

  linhaValores: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 10 },
  colunaValor: { alignItems: 'center', width: '48%', backgroundColor: '#F8FAFC', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E0E6ED', marginBottom: 10 },
  labelValor: { fontSize: 11, color: '#7F8C8D', marginBottom: 5, fontWeight: 'bold', textTransform: 'uppercase' },
  textoValor: { fontSize: 17, fontWeight: '800' },
  
  barraSaldo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, borderWidth: 1 },
  labelSaldoTotal: { fontSize: 12, fontWeight: 'bold' },
  valorSaldoTotal: { fontSize: 18, fontWeight: '900' },

  botoesHistoricoContainer: { marginTop: 15 },
  btnToggleHistorico: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 6, borderWidth: 1 },
  txtToggleHistorico: { fontWeight: 'bold', fontSize: 12, marginLeft: 5 },
  containerHistorico: { marginTop: 5, backgroundColor: '#FFF', borderRadius: 8, padding: 10, borderWidth: 1 },
  tituloHistorico: { fontSize: 13, fontWeight: 'bold', color: '#34495E', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EAEDED', paddingBottom: 5 },
  itemHistorico: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, backgroundColor: '#FFF', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#F2F4F4' },
  historicoIcone: { marginRight: 10 },
  historicoDados: { flex: 1 },
  historicoData: { fontSize: 11, color: '#7F8C8D', fontWeight: '600' },
  historicoRomaneio: { fontSize: 12, color: '#34495E', marginTop: 2 },
  historicoQtd: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  historicoQtdValor: { fontWeight: 'bold', fontSize: 12 },

  emptyText: { textAlign: 'center', color: '#7F8C8D', marginTop: 35, fontSize: 16 },

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