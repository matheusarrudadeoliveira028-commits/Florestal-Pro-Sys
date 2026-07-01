import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

// 👉 FUNÇÃO PARA ALERTAS HÍBRIDOS (WEB/MOBILE)
const alertaHibrido = (titulo: string, mensagem: string) => {
  if (Platform.OS === 'web') window.alert(`${titulo}\n\n${mensagem}`);
  else Alert.alert(titulo, mensagem);
};

export default function MapaScreen() {
  const [dadosBrutos, setDadosBrutos] = useState<any[]>([]);
  const [dadosAgrupados, setDadosAgrupados] = useState<any>({});
  const [totalGeralArvores, setTotalGeralArvores] = useState(0);
  
  const [carregando, setCarregando] = useState(true);
  const [gerandoPDF, setGerandoPDF] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  
  const [listaServicos, setListaServicos] = useState<any[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);

  // 👉 ESTADOS DOS FILTROS
  const [filtroFazenda, setFiltroFazenda] = useState('');
  const [filtroQuadra, setFiltroQuadra] = useState('');
  const [fazendasDisponiveis, setFazendasDisponiveis] = useState<string[]>([]);
  const [quadrasDisponiveis, setQuadrasDisponiveis] = useState<string[]>([]);

  useEffect(() => {
    verificarPerfil();
    carregarMapa();
  }, []);

  // Efeito Cascata dos Filtros
  useEffect(() => {
    let filtrados = dadosBrutos;

    // ALGORITMO FAXINEIRO: Limpa os espaços invisíveis antes de extrair as listas
    const limpar = (txt: string) => txt ? txt.trim().replace(/\s+/g, ' ') : '';

    const fazendas = [...new Set(dadosBrutos.map(item => limpar(item.fazenda)))].sort();
    setFazendasDisponiveis(fazendas as string[]);

    if (filtroFazenda) {
      filtrados = filtrados.filter(item => limpar(item.fazenda) === filtroFazenda);
      const quadras = [...new Set(filtrados.map(item => limpar(item.quadra)))].sort();
      setQuadrasDisponiveis(quadras as string[]);
    } else {
      setQuadrasDisponiveis([]);
      setFiltroQuadra('');
    }

    if (filtroQuadra) {
      filtrados = filtrados.filter(item => limpar(item.quadra) === filtroQuadra);
    }

    processarDadosMapa(filtrados);
  }, [filtroFazenda, filtroQuadra, dadosBrutos]);

  const verificarPerfil = async () => {
    try {
      const perfilSalvo = await AsyncStorage.getItem('@perfil_offline');
      if (perfilSalvo) {
        const perfil = JSON.parse(perfilSalvo);
        const cargoLimpo = perfil.cargo ? perfil.cargo.trim().toLowerCase() : '';
        setPodeEditar(cargoLimpo === 'administrador' || cargoLimpo === 'supervisor');
      }
    } catch (e) {
      setPodeEditar(false);
    }
  };

  const carregarMapa = async () => {
    setCarregando(true);
    try {
      const { data: servs } = await supabase.from('servicos').select('*').order('nome');
      if (servs) {
        setListaServicos(servs);
        await AsyncStorage.setItem('@mochila_servicos', JSON.stringify(servs));
      }

      const { data, error } = await supabase.from('mapa_fazendas').select('*');
      if (error) throw new Error("Falha na rede");
      
      if (data) {
        await AsyncStorage.setItem('@mochila_mapa', JSON.stringify(data));
        setDadosBrutos(data); // Salva os dados brutos para o filtro trabalhar
      }
      setIsOffline(false); 
    } catch (error) {
      setIsOffline(true);
      const servsOffline = await AsyncStorage.getItem('@mochila_servicos');
      if (servsOffline) setListaServicos(JSON.parse(servsOffline));
      const mapaOffline = await AsyncStorage.getItem('@mochila_mapa');
      if (mapaOffline) setDadosBrutos(JSON.parse(mapaOffline));
    }
    setCarregando(false);
  };

  const processarDadosMapa = (data: any[]) => {
    let somaGeral = 0;
    const agrupamento: any = {};

    // 👉 ALGORITMO FAXINEIRO EM AÇÃO
    const limpar = (txt: string) => txt ? txt.trim().replace(/\s+/g, ' ') : 'N/A';

    // Ordena os dados para a lista ficar bonita (Fazenda > Quadra > Ramal numérico)
    const dadosOrdenados = [...data].sort((a, b) => {
      if (limpar(a.fazenda) < limpar(b.fazenda)) return -1;
      if (limpar(a.fazenda) > limpar(b.fazenda)) return 1;
      if (limpar(a.quadra) < limpar(b.quadra)) return -1;
      if (limpar(a.quadra) > limpar(b.quadra)) return 1;
      return (parseInt(a.ramal) || 0) - (parseInt(b.ramal) || 0);
    });

    dadosOrdenados.forEach((item) => {
      const qtd = item.total_pes || 0;
      somaGeral += qtd;

      const faz = limpar(item.fazenda);
      const qdr = limpar(item.quadra);

      if (!agrupamento[faz]) agrupamento[faz] = { total: 0, quadras: {} };
      agrupamento[faz].total += qtd;

      if (!agrupamento[faz].quadras[qdr]) agrupamento[faz].quadras[qdr] = { total: 0, ramais: [] };
      agrupamento[faz].quadras[qdr].total += qtd;

      agrupamento[faz].quadras[qdr].ramais.push({
        id: item.id, 
        ramal: item.ramal,
        total: qtd,
        servico: item.servico_permitido || 'Não Definido'
      });
    });

    setTotalGeralArvores(somaGeral);
    setDadosAgrupados(agrupamento);
  };

  const confirmarAtualizacao = (id: number, campo: string, valorAntigo: any, valorNovo: any, nomeAmigavel: string) => {
    if (valorAntigo === valorNovo) return; 
    
    if (isOffline) {
      alertaHibrido("⚠️ Sem Internet", "Não é possível alterar a estrutura da fazenda no modo offline.");
      return;
    }

    if (Platform.OS === 'web') {
      const confirmado = window.confirm(`⚠️ Tem certeza que deseja alterar ${nomeAmigavel} para "${valorNovo}"?`);
      if (confirmado) atualizarConfigRamal(id, campo, valorNovo);
      else carregarMapa();
    } else {
      Alert.alert(
        "⚠️ Atenção",
        `Tem certeza que deseja alterar ${nomeAmigavel} para "${valorNovo}"?`,
        [
          { text: "Cancelar", style: "cancel", onPress: () => carregarMapa() },
          { text: "Sim, Alterar", onPress: () => atualizarConfigRamal(id, campo, valorNovo) }
        ]
      );
    }
  };

  const atualizarConfigRamal = async (id: number, campo: string, valor: any) => {
    setCarregando(true);
    const { error } = await supabase.from('mapa_fazendas').update({ [campo]: valor }).eq('id', id);
    if (error) {
      alertaHibrido("Erro", "Falha ao atualizar o dado.");
      carregarMapa();
    } else {
      // Atualiza os dados brutos sem precisar recarregar tudo da internet
      const novosDados = dadosBrutos.map(item => item.id === id ? { ...item, [campo]: valor } : item);
      setDadosBrutos(novosDados);
      setCarregando(false);
    }
  };

  // 👉 GERADOR DE PDF INTELIGENTE
  const gerarPdfMapa = async () => {
    if (Object.keys(dadosAgrupados).length === 0) return alertaHibrido("Aviso", "Não há dados para gerar o PDF.");
    setGerandoPDF(true);

    try {
      // Lógica Blindada de Logo para Web/Mobile
      let base64Logo = '';
      try {
        const [asset] = await Asset.loadAsync(require('../../assets/images/logo.png'));
        if (Platform.OS === 'web') {
          base64Logo = asset.uri;
        } else {
          let uriToRead = asset.localUri || asset.uri;
          if (uriToRead.startsWith('http')) {
            const cacheDir = FileSystem.cacheDirectory || ''; 
            const tempFile = cacheDir + 'logo_mapa_temp.png';
            await FileSystem.downloadAsync(uriToRead, tempFile);
            uriToRead = tempFile;
          }
          const base64 = await FileSystem.readAsStringAsync(uriToRead, { encoding: 'base64' });
          base64Logo = `data:image/png;base64,${base64}`;
        }
      } catch (imgErr) {
        console.warn("Sem logo", imgErr);
      }

      let htmlTabelas = '';

      Object.keys(dadosAgrupados).forEach(faz => {
        htmlTabelas += `<div class="fazenda-title">📍 FAZENDA: ${faz.toUpperCase()} <span style="float: right;">${dadosAgrupados[faz].total.toLocaleString('pt-BR')} Pés</span></div>`;
        
        Object.keys(dadosAgrupados[faz].quadras).forEach(qd => {
          htmlTabelas += `
            <table>
              <thead>
                <tr>
                  <th colspan="3" class="quadra-header">QUADRA ${qd} <span style="float: right; color: #D35400;">${dadosAgrupados[faz].quadras[qd].total.toLocaleString('pt-BR')} Pés</span></th>
                </tr>
                <tr>
                  <th style="width: 20%;">Ramal</th>
                  <th style="width: 50%;">Serviço Vinculado</th>
                  <th style="width: 30%;">Quantidade (Pés)</th>
                </tr>
              </thead>
              <tbody>
          `;
          
          dadosAgrupados[faz].quadras[qd].ramais.forEach((rm: any) => {
            htmlTabelas += `
              <tr>
                <td><strong>Rm ${rm.ramal}</strong></td>
                <td>${rm.servico}</td>
                <td style="font-weight: bold;">${rm.total.toLocaleString('pt-BR')}</td>
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
              h2 { color: #2C3E50; margin: 0; font-size: 20px; text-transform: uppercase; }
              .resumo-filtros { background-color: #F8FAFC; padding: 10px; border: 1px solid #BDC3C7; border-radius: 5px; margin-bottom: 20px; }
              .cards { display: flex; justify-content: center; margin-bottom: 20px; }
              .card { width: 100%; padding: 15px; border-radius: 5px; text-align: center; font-weight: bold; font-size: 16px; background-color: #E8F8F5; color: #27AE60; border: 1px solid #2ECC71; }
              .fazenda-title { background-color: #2C3E50; color: #FFF; padding: 10px; font-size: 14px; font-weight: bold; margin-top: 20px; border-radius: 4px 4px 0 0; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #BDC3C7; padding: 8px; text-align: left; }
              th { text-align: center; }
              td:nth-child(1), td:nth-child(3) { text-align: center; }
              .quadra-header { background-color: #ECF0F1; color: #34495E; font-size: 13px; text-align: left; padding-left: 10px; }
            </style>
          </head>
          <body>
            <div class="header-container">
              ${base64Logo ? `<div class="header-logo"><img src="${base64Logo}" alt="Logo" /></div>` : '<div></div>'}
              <div style="text-align: right;">
                <h2>MAPEAMENTO ESTRUTURAL</h2>
                <p style="margin: 5px 0 0 0; color: #7F8C8D;">Data da Geração: ${new Date().toLocaleDateString('pt-BR')}</p>
              </div>
            </div>

            <div class="resumo-filtros">
              <strong>Filtros Aplicados:</strong> 
              Fazenda: ${filtroFazenda || 'Todas'} | Quadra: ${filtroQuadra || 'Todas'}
            </div>

            <div class="cards">
              <div class="card">TOTAL DE ÁRVORES MAPEADAS<br><span style="font-size: 28px; color: #1E8449;">${totalGeralArvores.toLocaleString('pt-BR')} Pés</span></div>
            </div>

            ${htmlTabelas}

            <div style="margin-top: 40px; text-align: center; font-size: 10px; color: #95A5A6;">
              Documento gerado pelo sistema Production System
            </div>
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
      alertaHibrido("Erro", "Falha ao gerar PDF.");
    } finally {
      setGerandoPDF(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {isOffline && (
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineText}>⚠️ MODO OFFLINE ATIVADO - Apenas visualização.</Text>
        </View>
      )}

      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 50 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Mapa da Fazenda 🌳</Text>
          <Text style={styles.subtitle}>Gestão de Estrutura e Capacidade</Text>
        </View>

        {/* 👉 NOVOS FILTROS DE MAPA */}
        <View style={styles.filtrosCard}>
          <Text style={styles.filtrosTitulo}>Filtros de Localização:</Text>
          <View style={styles.row}>
            <View style={styles.col}>
              <View style={styles.pickerWrapper}>
                <Picker selectedValue={filtroFazenda} onValueChange={setFiltroFazenda} style={styles.pickerItem}>
                  <Picker.Item label="Todas Fazendas" value="" />
                  {fazendasDisponiveis.map(f => <Picker.Item key={f} label={f} value={f} />)}
                </Picker>
              </View>
            </View>
            <View style={styles.col}>
              <View style={[styles.pickerWrapper, !filtroFazenda && styles.pickerDisabled]}>
                <Picker enabled={!!filtroFazenda} selectedValue={filtroQuadra} onValueChange={setFiltroQuadra} style={styles.pickerItem}>
                  <Picker.Item label="Todas Quadras" value="" />
                  {quadrasDisponiveis.map(q => <Picker.Item key={q} label={`Qd ${q}`} value={q} />)}
                </Picker>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.placarCard}>
          <Text style={styles.placarTexto}>Total de Pés (Filtro Atual)</Text>
          <Text style={styles.placarNumero}>{totalGeralArvores.toLocaleString('pt-BR')}</Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25, gap: 10 }}>
          <TouchableOpacity style={styles.btnAtualizar} onPress={carregarMapa}>
            <Text style={styles.btnAtualizarTexto}>↻ Atualizar DB</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.btnPdf} onPress={gerarPdfMapa} disabled={gerandoPDF}>
            {gerandoPDF ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnPdfTexto}>🖨️ Imprimir PDF</Text>}
          </TouchableOpacity>
        </View>

        {carregando ? (
          <ActivityIndicator size="large" color="#27AE60" style={{marginTop: 30}} />
        ) : (
          <View style={styles.listaContainer}>
            {Object.keys(dadosAgrupados).length === 0 ? (
              <Text style={{ textAlign: 'center', color: '#7F8C8D', marginTop: 20 }}>Nenhum dado encontrado.</Text>
            ) : (
              Object.keys(dadosAgrupados).map((nomeFazenda) => {
                const fazenda = dadosAgrupados[nomeFazenda];
                return (
                  <View key={nomeFazenda} style={styles.fazendaCard}>
                    <View style={styles.fazendaHeader}>
                      <Text style={styles.fazendaTitulo}>📍 Fazenda {nomeFazenda}</Text>
                      <Text style={styles.fazendaTotal}>{fazenda.total.toLocaleString('pt-BR')} pés</Text>
                    </View>

                    {Object.keys(fazenda.quadras).map((nomeQuadra) => {
                      const quadra = fazenda.quadras[nomeQuadra];
                      return (
                        <View key={nomeQuadra} style={styles.quadraContainer}>
                          <View style={styles.quadraHeader}>
                            <Text style={styles.quadraTitulo}>Quadra {nomeQuadra}</Text>
                            <Text style={styles.quadraTotal}>{quadra.total.toLocaleString('pt-BR')} pés</Text>
                          </View>

                          <View style={styles.ramalContainer}>
                            {quadra.ramais.map((r: any, idx: number) => (
                              <View key={r.id || idx} style={styles.ramalItem}>
                                
                                <View style={{ flex: 1.5, paddingRight: 10 }}>
                                  <Text style={styles.ramalTexto}>↳ Ramal {r.ramal}</Text>
                                  <Text style={styles.miniLabel}>Serviço Vinculado:</Text>
                                  
                                  <View style={[styles.miniPickerContainer, !podeEditar && styles.pickerBloqueado]}>
                                    <Picker
                                      enabled={podeEditar} 
                                      selectedValue={r.servico}
                                      onValueChange={(itemValue) => {
                                        if (itemValue !== r.servico && podeEditar) {
                                          confirmarAtualizacao(r.id, 'servico_permitido', r.servico, itemValue, 'o Serviço');
                                        }
                                      }}
                                      style={styles.miniPicker}
                                    >
                                      <Picker.Item label="Não Definido" value="Não Definido" />
                                      {listaServicos.map((s) => (
                                        <Picker.Item key={s.id} label={s.nome} value={s.nome} />
                                      ))}
                                    </Picker>
                                  </View>
                                </View>

                                <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                                  <Text style={styles.miniLabel}>Qtd Pés (Editar):</Text>
                                  <TextInput 
                                    editable={podeEditar} 
                                    style={[styles.inputEditQtd, !podeEditar && styles.inputBloqueado]} 
                                    defaultValue={r.total.toString()}
                                    keyboardType="numeric"
                                    onEndEditing={(e) => {
                                      if (podeEditar) {
                                        const novoValor = parseInt(e.nativeEvent.text) || 0;
                                        confirmarAtualizacao(r.id, 'total_pes', r.total, novoValor, 'a Quantidade de Pés');
                                      }
                                    }}
                                  />
                                </View>
                              </View>
                            ))}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F4F7', padding: 15 },
  offlineBadge: { backgroundColor: '#E74C3C', padding: 8, alignItems: 'center', justifyContent: 'center' },
  offlineText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  header: { marginBottom: 15, marginTop: 10, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 14, color: '#7F8C8D', marginTop: 3 },
  
  // Filtros
  filtrosCard: { backgroundColor: '#FFFFFF', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 2, borderWidth: 1, borderColor: '#E0E6ED' },
  filtrosTitulo: { fontSize: 14, fontWeight: 'bold', color: '#34495E', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  col: { flex: 1 },
  pickerWrapper: { borderWidth: 1, borderColor: '#BDC3C7', borderRadius: 8, backgroundColor: '#F8FAFC', height: 45, justifyContent: 'center', overflow: 'hidden' },
  pickerItem: { height: 45, width: '100%', color: '#2C3E50' },
  pickerDisabled: { opacity: 0.5, backgroundColor: '#EAEDED' },

  placarCard: { backgroundColor: '#27AE60', padding: 20, borderRadius: 12, alignItems: 'center', marginBottom: 15, elevation: 3 },
  placarTexto: { color: '#D5F5E3', fontSize: 15, fontWeight: 'bold' },
  placarNumero: { color: '#FFFFFF', fontSize: 40, fontWeight: '900', marginVertical: 5 },
  
  btnAtualizar: { flex: 1, backgroundColor: '#BDC3C7', padding: 12, borderRadius: 8, alignItems: 'center' },
  btnAtualizarTexto: { color: '#2C3E50', fontWeight: 'bold', fontSize: 14 },
  btnPdf: { flex: 1, backgroundColor: '#E67E22', padding: 12, borderRadius: 8, alignItems: 'center' },
  btnPdfTexto: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  
  listaContainer: { paddingBottom: 20 },
  
  // Organização Visual Premium
  fazendaCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 15, marginBottom: 20, elevation: 2, borderWidth: 1, borderColor: '#D5DBDB' },
  fazendaHeader: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 3, borderBottomColor: '#2C3E50', paddingBottom: 10, marginBottom: 15 },
  fazendaTitulo: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50' },
  fazendaTotal: { fontSize: 16, fontWeight: 'bold', color: '#27AE60' },
  
  quadraContainer: { backgroundColor: '#F8FAFC', borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#E5E8E8', overflow: 'hidden' },
  quadraHeader: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#EAEDED', padding: 10, borderBottomWidth: 1, borderBottomColor: '#D5DBDB' },
  quadraTitulo: { fontSize: 15, fontWeight: 'bold', color: '#34495E' },
  quadraTotal: { fontSize: 15, fontWeight: 'bold', color: '#D35400' },
  
  ramalContainer: { paddingHorizontal: 10, paddingBottom: 5 },
  ramalItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F2F4F4', alignItems: 'center' },
  ramalTexto: { fontSize: 14, color: '#2C3E50', fontWeight: 'bold' },
  
  miniLabel: { fontSize: 11, color: '#7F8C8D', marginTop: 4, fontWeight: 'bold' },
  miniPickerContainer: { backgroundColor: '#D4E6F1', borderRadius: 6, marginTop: 4, height: 40, justifyContent: 'center', overflow: 'hidden' },
  pickerBloqueado: { backgroundColor: '#EAECEE', opacity: 0.8 }, 
  miniPicker: { height: 40, color: '#2980B9', width: '100%', fontWeight: 'bold', fontSize: 12 },

  inputEditQtd: { backgroundColor: '#EAEDED', color: '#2C3E50', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, marginTop: 4, fontSize: 14, fontWeight: 'bold', textAlign: 'center', minWidth: 80, borderWidth: 1, borderColor: '#BDC3C7' },
  inputBloqueado: { backgroundColor: '#F8FAFC', color: '#95A5A6', borderColor: 'transparent' } 
});