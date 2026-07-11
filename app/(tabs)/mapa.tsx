import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, InteractionManager, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

const alertaHibrido = (titulo: string, mensagem: string) => {
  if (Platform.OS === 'web') window.alert(`${titulo}\n\n${mensagem}`);
  else Alert.alert(titulo, mensagem);
};

// =========================================================================
// COMPONENTES ISOLADOS E MEMOIZADOS (React.memo)
// =========================================================================
const FazendaHeader = memo(({ nome, total }: { nome: string, total: number }) => (
  <View style={styles.fazendaHeader}>
    <Text style={styles.fazendaTitulo}>📍 Fazenda {nome}</Text>
    <Text style={styles.fazendaTotal}>{total.toLocaleString('pt-BR')} pés</Text>
  </View>
));

const QuadraHeader = memo(({ nome, total }: { nome: string, total: number }) => (
  <View style={styles.quadraHeader}>
    <Text style={styles.quadraTitulo}>Quadra {nome}</Text>
    <Text style={styles.quadraTotal}>{total.toLocaleString('pt-BR')} pés</Text>
  </View>
));

const RamalItem = memo(({ r, podeEditar, listaServicos, onAtualizar }: any) => {
  return (
    <View style={styles.ramalItem}>
      <View style={{ flex: 1.5, paddingRight: 10 }}>
        <Text style={styles.ramalTexto}>↳ Ramal {r.ramal}</Text>
        <Text style={styles.miniLabel}>Serviço Vinculado:</Text>
        
        <View style={[styles.miniPickerContainer, !podeEditar && styles.pickerBloqueado]}>
          <Picker
            enabled={podeEditar} 
            selectedValue={r.servico}
            onValueChange={(itemValue) => {
              if (itemValue !== r.servico && podeEditar) {
                onAtualizar(r.id, 'servico_permitido', r.servico, itemValue, 'o Serviço');
              }
            }}
            style={styles.miniPicker}
          >
            <Picker.Item label="Não Definido" value="Não Definido" />
            {listaServicos.map((s: any) => (
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
              onAtualizar(r.id, 'total_pes', r.total, novoValor, 'a Quantidade de Pés');
            }
          }}
        />
      </View>
    </View>
  );
});

const ResumoCard = memo(({ fazenda, total, quadras }: any) => {
  const [expandido, setExpandido] = useState(false);

  return (
    <View style={styles.resumoCard}>
      <TouchableOpacity style={styles.resumoHeader} onPress={() => setExpandido(!expandido)}>
        <Text style={styles.resumoFazendaNome}>📍 {fazenda}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.resumoFazendaTotal}>{total.toLocaleString('pt-BR')} pés</Text>
          <Text style={styles.resumoVerMais}>{expandido ? '▲ Ocultar Quadras' : '▼ Ver Quadras'}</Text>
        </View>
      </TouchableOpacity>
      
      {expandido && (
        <View style={styles.resumoQuadrasContainer}>
          {quadras.map((q: any, idx: number) => (
            <View key={idx} style={styles.resumoQuadraRow}>
              <Text style={styles.resumoQuadraNome}>Quadra {q.quadra}</Text>
              <Text style={styles.resumoQuadraTotal}>{q.total.toLocaleString('pt-BR')} pés</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
});

// =========================================================================
// TELA PRINCIPAL
// =========================================================================
export default function MapaScreen() {
  const [abaAtiva, setAbaAtiva] = useState<'mapa' | 'resumo'>('mapa');

  const [dadosBrutos, setDadosBrutos] = useState<any[]>([]);
  const [dadosAgrupadosParaPDF, setDadosAgrupadosParaPDF] = useState<any>({});
  const [listaPlanaParaUI, setListaPlanaParaUI] = useState<any[]>([]);
  
  const [totalGeralArvores, setTotalGeralArvores] = useState(0);
  const [carregando, setCarregando] = useState(false); 
  const [gerandoPDF, setGerandoPDF] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [listaServicos, setListaServicos] = useState<any[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);

  const [dicionario, setDicionario] = useState<any>({});
  const [listaResumo, setListaResumo] = useState<any[]>([]);
  
  const [fazendasDisponiveis, setFazendasDisponiveis] = useState<string[]>([]);
  const [quadrasDisponiveis, setQuadrasDisponiveis] = useState<string[]>([]);
  const [ramaisDisponiveis, setRamaisDisponiveis] = useState<string[]>([]);

  const [buscaFazenda, setBuscaFazenda] = useState('');
  const [buscaQuadra, setBuscaQuadra] = useState('');
  const [buscaRamal, setBuscaRamal] = useState('');

  useEffect(() => {
    const tarefa = InteractionManager.runAfterInteractions(() => {
      verificarPerfil();
      carregarDicionarioEServicos(); 
    });
    return () => tarefa.cancel();
  }, []);

  useEffect(() => {
    if (buscaFazenda && dicionario[buscaFazenda]) {
      const quadras = Object.keys(dicionario[buscaFazenda].quadras).sort();
      setQuadrasDisponiveis(quadras);
    } else {
      setQuadrasDisponiveis([]);
      setBuscaQuadra('');
    }
  }, [buscaFazenda, dicionario]);

  useEffect(() => {
    if (buscaFazenda && buscaQuadra && dicionario[buscaFazenda]?.quadras[buscaQuadra]) {
      const ramais = dicionario[buscaFazenda].quadras[buscaQuadra].ramais.sort((a: string, b: string) => parseInt(a) - parseInt(b));
      setRamaisDisponiveis(ramais);
    } else {
      setRamaisDisponiveis([]);
      setBuscaRamal('');
    }
  }, [buscaQuadra, buscaFazenda, dicionario]);

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

  const carregarDicionarioEServicos = async () => {
    setCarregando(true);
    try {
      const { data: servs } = await supabase.from('servicos').select('*').order('nome');
      if (servs) {
        setListaServicos(servs);
        await AsyncStorage.setItem('@mochila_servicos', JSON.stringify(servs));
      }

      const { data: mapaResumo, error } = await supabase.from('mapa_fazendas').select('fazenda, quadra, ramal, total_pes');
      if (error) throw new Error("Falha na rede");

      if (mapaResumo) {
        montarDicionario(mapaResumo);
        await AsyncStorage.setItem('@mochila_dicionario_mapa', JSON.stringify(mapaResumo));
      }
      setIsOffline(false);
    } catch (error) {
      setIsOffline(true);
      const servsOffline = await AsyncStorage.getItem('@mochila_servicos');
      if (servsOffline) setListaServicos(JSON.parse(servsOffline));

      const mapaOffline = await AsyncStorage.getItem('@mochila_dicionario_mapa');
      if (mapaOffline) montarDicionario(JSON.parse(mapaOffline));
    }
    setCarregando(false);
  };

  const montarDicionario = (data: any[]) => {
    const dic: any = {};
    const limpar = (txt: string) => txt ? txt.trim().replace(/\s+/g, ' ') : 'N/A';

    data.forEach(item => {
      const faz = limpar(item.fazenda);
      const qdr = limpar(item.quadra);
      const ramal = limpar(item.ramal);
      const pes = item.total_pes || 0;

      if (!dic[faz]) dic[faz] = { total: 0, quadras: {} };
      dic[faz].total += pes;

      if (!dic[faz].quadras[qdr]) dic[faz].quadras[qdr] = { total: 0, ramais: [] };
      dic[faz].quadras[qdr].total += pes;

      if (!dic[faz].quadras[qdr].ramais.includes(ramal)) {
        dic[faz].quadras[qdr].ramais.push(ramal);
      }
    });

    setDicionario(dic);
    setFazendasDisponiveis(Object.keys(dic).sort());

    const resumo = Object.keys(dic).map(faz => ({
      fazenda: faz,
      total: dic[faz].total,
      quadras: Object.keys(dic[faz].quadras).map(qdr => ({
        quadra: qdr,
        total: dic[faz].quadras[qdr].total
      })).sort((a, b) => a.quadra.localeCompare(b.quadra))
    })).sort((a, b) => a.fazenda.localeCompare(b.fazenda));

    setListaResumo(resumo);
  };

  const buscarMapaDetalhado = async () => {
    if (!buscaFazenda) {
      return alertaHibrido("Aviso", "Selecione pelo menos a Fazenda.");
    }
    
    setCarregando(true);

    try {
      // 👉 CORREÇÃO 2: Vazamento de memória resolvido (Seleciona apenas o necessário)
      let query = supabase.from('mapa_fazendas').select('id, fazenda, quadra, ramal, total_pes, servico_permitido').eq('fazenda', buscaFazenda);
      
      if (buscaQuadra) query = query.eq('quadra', buscaQuadra);
      if (buscaRamal) query = query.eq('ramal', buscaRamal);

      // 👉 CORREÇÃO 1: Limite aumentado para não cortar ramais grandes
      const { data, error } = await query.limit(3000);
        
      if (error) throw new Error("Falha na rede");
      
      if (data && data.length > 0) {
        setDadosBrutos(data);
        processarDadosMapa(data);
        await AsyncStorage.setItem('@mochila_mapa_ultimo', JSON.stringify(data));
      } else {
        alertaHibrido("Vazio", "Nenhuma árvore encontrada para este filtro.");
        setDadosBrutos([]);
        processarDadosMapa([]);
      }
      setIsOffline(false); 
    } catch (error) {
      setIsOffline(true);
      const mapaOffline = await AsyncStorage.getItem('@mochila_mapa_ultimo');
      
      if (mapaOffline) {
        let dadosOff = JSON.parse(mapaOffline);
        
        // 👉 CORREÇÃO 3: Filtro local no modo offline
        if (buscaFazenda) dadosOff = dadosOff.filter((i: any) => i.fazenda === buscaFazenda);
        if (buscaQuadra) dadosOff = dadosOff.filter((i: any) => i.quadra === buscaQuadra);
        if (buscaRamal) dadosOff = dadosOff.filter((i: any) => String(i.ramal) === String(buscaRamal));

        if (dadosOff.length > 0) {
          setDadosBrutos(dadosOff);
          processarDadosMapa(dadosOff);
          alertaHibrido("Offline", "Mostrando dados salvos no tablet.");
        } else {
          alertaHibrido("Offline", "O filtro selecionado não estava salvo no tablet.");
          setDadosBrutos([]);
          processarDadosMapa([]);
        }
      } else {
        setDadosBrutos([]);
        processarDadosMapa([]);
      }
    }
    setCarregando(false);
  };

  const processarDadosMapa = (data: any[]) => {
    let somaGeral = 0;
    const agrupamento: any = {};
    const limpar = (txt: string) => txt ? txt.trim().replace(/\s+/g, ' ') : 'N/A';

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

    const listaPlana: any[] = [];
    Object.keys(agrupamento).forEach((faz) => {
      listaPlana.push({ id: `faz-${faz}`, type: 'FAZENDA', nome: faz, total: agrupamento[faz].total });
      
      Object.keys(agrupamento[faz].quadras).forEach((qd) => {
        listaPlana.push({ id: `faz-${faz}-qd-${qd}`, type: 'QUADRA', nome: qd, total: agrupamento[faz].quadras[qd].total });
        
        agrupamento[faz].quadras[qd].ramais.forEach((rm: any) => {
          listaPlana.push({ id: `rm-${rm.id}`, type: 'RAMAL', data: rm });
        });
      });
    });

    setTotalGeralArvores(somaGeral);
    setDadosAgrupadosParaPDF(agrupamento); 
    setListaPlanaParaUI(listaPlana);       
  };

  const handleAtualizar = useCallback((id: number, campo: string, valorAntigo: any, valorNovo: any, nomeAmigavel: string) => {
    if (valorAntigo === valorNovo) return; 
    
    if (isOffline) {
      return alertaHibrido("⚠️ Sem Internet", "Não é possível alterar a estrutura da fazenda no modo offline.");
    }

    if (Platform.OS === 'web') {
      const confirmado = window.confirm(`⚠️ Tem certeza que deseja alterar ${nomeAmigavel} para "${valorNovo}"?`);
      if (confirmado) atualizarConfigRamal(id, campo, valorNovo);
    } else {
      Alert.alert(
        "⚠️ Atenção",
        `Tem certeza que deseja alterar ${nomeAmigavel} para "${valorNovo}"?`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Sim, Alterar", onPress: () => atualizarConfigRamal(id, campo, valorNovo) }
        ]
      );
    }
  }, [isOffline]);

  const atualizarConfigRamal = async (id: number, campo: string, valor: any) => {
    setCarregando(true);
    const { error } = await supabase.from('mapa_fazendas').update({ [campo]: valor }).eq('id', id);
    if (error) {
      alertaHibrido("Erro", "Falha ao atualizar o dado.");
    } else {
      const novaListaBruta = dadosBrutos.map(item => item.id === id ? { ...item, [campo]: valor } : item);
      setDadosBrutos(novaListaBruta);
      processarDadosMapa(novaListaBruta);
      carregarDicionarioEServicos();
    }
    setCarregando(false);
  };

  const gerarPdfMapa = async () => {
    if (Object.keys(dadosAgrupadosParaPDF).length === 0) return alertaHibrido("Aviso", "Não há dados para gerar o PDF.");
    setGerandoPDF(true);

    try {
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

      Object.keys(dadosAgrupadosParaPDF).forEach(faz => {
        htmlTabelas += `<div class="fazenda-title">📍 FAZENDA: ${faz.toUpperCase()} <span style="float: right;">${dadosAgrupadosParaPDF[faz].total.toLocaleString('pt-BR')} Pés</span></div>`;
        
        Object.keys(dadosAgrupadosParaPDF[faz].quadras).forEach(qd => {
          htmlTabelas += `
            <table>
              <thead>
                <tr>
                  <th colspan="3" class="quadra-header">QUADRA ${qd} <span style="float: right; color: #D35400;">${dadosAgrupadosParaPDF[faz].quadras[qd].total.toLocaleString('pt-BR')} Pés</span></th>
                </tr>
                <tr>
                  <th style="width: 20%;">Ramal</th>
                  <th style="width: 50%;">Serviço Vinculado</th>
                  <th style="width: 30%;">Quantidade (Pés)</th>
                </tr>
              </thead>
              <tbody>
          `;
          
          dadosAgrupadosParaPDF[faz].quadras[qd].ramais.forEach((rm: any) => {
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
              <strong>Filtro Aplicado:</strong> Fazenda: ${buscaFazenda || 'N/A'} | Quadra: ${buscaQuadra || 'N/A'}
            </div>

            <div class="cards">
              <div class="card">TOTAL DE ÁRVORES NA TELA<br><span style="font-size: 28px; color: #1E8449;">${totalGeralArvores.toLocaleString('pt-BR')} Pés</span></div>
            </div>

            ${htmlTabelas}

            <div style="margin-top: 40px; text-align: center; font-size: 10px; color: #95A5A6;">
              Documento gerado pelo sistema Resinas Abud
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

  const renderItem = useCallback(({ item }: any) => {
    if (item.type === 'FAZENDA') return <FazendaHeader nome={item.nome} total={item.total} />;
    if (item.type === 'QUADRA') return <QuadraHeader nome={item.nome} total={item.total} />;
    if (item.type === 'RAMAL') {
      return (
        <View style={styles.ramalWrapper}>
          <RamalItem r={item.data} podeEditar={podeEditar} listaServicos={listaServicos} onAtualizar={handleAtualizar} />
        </View>
      );
    }
    return null;
  }, [podeEditar, listaServicos, handleAtualizar]);

  return (
    <View style={styles.container}>
      {isOffline && (
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineText}>⚠️ MODO OFFLINE ATIVADO - Usando dados salvos no tablet.</Text>
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.title}>Mapa da Fazenda 🌳</Text>
        <Text style={styles.subtitle}>Gestão de Estrutura e Capacidade</Text>
      </View>

      <View style={styles.menuAbas}>
        <TouchableOpacity style={[styles.abaBotao, abaAtiva === 'mapa' && styles.abaAtiva]} onPress={() => setAbaAtiva('mapa')}>
          <Text style={[styles.abaTexto, abaAtiva === 'mapa' && styles.abaTextoAtivo]}>Mapeamento & Edição</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.abaBotao, abaAtiva === 'resumo' && styles.abaAtiva]} onPress={() => setAbaAtiva('resumo')}>
          <Text style={[styles.abaTexto, abaAtiva === 'resumo' && styles.abaTextoAtivo]}>Resumo de Totais (Leve)</Text>
        </TouchableOpacity>
      </View>

      {abaAtiva === 'resumo' && (
        <View style={{ flex: 1 }}>
          {carregando ? (
            <ActivityIndicator size="large" color="#27AE60" style={{marginTop: 30}} />
          ) : listaResumo.length === 0 ? (
            <Text style={{ textAlign: 'center', color: '#7F8C8D', marginTop: 20 }}>Nenhum dado encontrado no momento.</Text>
          ) : (
            <FlatList
              data={listaResumo}
              keyExtractor={(item) => item.fazenda}
              renderItem={({ item }) => <ResumoCard fazenda={item.fazenda} total={item.total} quadras={item.quadras} />}
              contentContainerStyle={{ paddingBottom: 50 }}
            />
          )}
        </View>
      )}

      {abaAtiva === 'mapa' && (
        <>
          <View style={styles.filtrosCard}>
            <Text style={styles.filtrosTitulo}>Localizar para Editar:</Text>
            
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.labelInput}>Fazenda *</Text>
                <View style={styles.pickerWrapper}>
                  <Picker selectedValue={buscaFazenda} onValueChange={setBuscaFazenda} style={styles.pickerItem}>
                    <Picker.Item label="Selecione..." value="" />
                    {fazendasDisponiveis.map(f => <Picker.Item key={f} label={f} value={f} />)}
                  </Picker>
                </View>
              </View>
              <View style={styles.col}>
                <Text style={styles.labelInput}>Quadra *</Text>
                <View style={[styles.pickerWrapper, !buscaFazenda && styles.pickerDisabled]}>
                  <Picker enabled={!!buscaFazenda} selectedValue={buscaQuadra} onValueChange={setBuscaQuadra} style={styles.pickerItem}>
                    <Picker.Item label={buscaFazenda ? "Todas" : "Selecione a Fazenda"} value="" />
                    {quadrasDisponiveis.map(q => <Picker.Item key={q} label={`Quadra ${q}`} value={q} />)}
                  </Picker>
                </View>
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.col, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.labelInput}>Ramal (Opcional)</Text>
                <View style={[styles.pickerWrapper, !buscaQuadra && styles.pickerDisabled]}>
                  <Picker enabled={!!buscaQuadra} selectedValue={buscaRamal} onValueChange={setBuscaRamal} style={styles.pickerItem}>
                    <Picker.Item label={buscaQuadra ? "Todos" : "Selecione a Quadra"} value="" />
                    {ramaisDisponiveis.map(r => <Picker.Item key={r} label={`Ramal ${r}`} value={r} />)}
                  </Picker>
                </View>
              </View>
              <View style={{ justifyContent: 'flex-end' }}>
                <TouchableOpacity style={styles.btnBuscarFazenda} onPress={buscarMapaDetalhado} disabled={carregando}>
                  {carregando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnBuscarFazendaTexto}>🔍 Buscar Detalhes</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.placarCard}>
            <Text style={styles.placarTexto}>Total de Pés (Busca Atual)</Text>
            <Text style={styles.placarNumero}>{totalGeralArvores.toLocaleString('pt-BR')}</Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>
            <TouchableOpacity style={styles.btnPdf} onPress={gerarPdfMapa} disabled={gerandoPDF || listaPlanaParaUI.length === 0}>
              {gerandoPDF ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnPdfTexto}>🖨️ Imprimir PDF</Text>}
            </TouchableOpacity>
          </View>

          {carregando ? (
            <ActivityIndicator size="large" color="#27AE60" style={{marginTop: 30}} />
          ) : listaPlanaParaUI.length === 0 ? (
            <Text style={{ textAlign: 'center', color: '#7F8C8D', marginTop: 20 }}>Use os filtros acima para editar os ramais.</Text>
          ) : (
            <FlatList
              data={listaPlanaParaUI}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              initialNumToRender={15} 
              maxToRenderPerBatch={20}
              windowSize={5}
              removeClippedSubviews={true}
              contentContainerStyle={{ paddingBottom: 50, paddingTop: 10 }}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F4F7', padding: 15 },
  offlineBadge: { backgroundColor: '#E74C3C', padding: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 5, marginBottom: 10 },
  offlineText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  header: { marginBottom: 15, marginTop: 10, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 14, color: '#7F8C8D', marginTop: 3 },
  
  menuAbas: { flexDirection: 'row', backgroundColor: '#E0E6ED', borderRadius: 10, padding: 4, marginBottom: 15 },
  abaBotao: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  abaAtiva: { backgroundColor: '#FFFFFF', elevation: 2 },
  abaTexto: { fontWeight: 'bold', color: '#7F8C8D' },
  abaTextoAtivo: { color: '#2980B9' },

  filtrosCard: { backgroundColor: '#FFFFFF', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 2, borderWidth: 1, borderColor: '#E0E6ED' },
  filtrosTitulo: { fontSize: 16, fontWeight: 'bold', color: '#34495E', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#ECF0F1', paddingBottom: 5 },
  
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  col: { width: '48%' },
  
  labelInput: { fontSize: 12, fontWeight: 'bold', color: '#7F8C8D', marginBottom: 5 },
  
  btnBuscarFazenda: { backgroundColor: '#2980B9', height: 45, paddingHorizontal: 20, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  btnBuscarFazendaTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  
  pickerWrapper: { borderWidth: 1, borderColor: '#BDC3C7', borderRadius: 8, backgroundColor: '#F8FAFC', height: 45, justifyContent: 'center', overflow: 'hidden' },
  pickerItem: { height: 60, width: '100%', color: '#2C3E50' },
  pickerDisabled: { opacity: 0.5, backgroundColor: '#EAEDED' },

  placarCard: { backgroundColor: '#27AE60', padding: 20, borderRadius: 12, alignItems: 'center', marginBottom: 15, elevation: 3 },
  placarTexto: { color: '#D5F5E3', fontSize: 15, fontWeight: 'bold' },
  placarNumero: { color: '#FFFFFF', fontSize: 40, fontWeight: '900', marginVertical: 5 },
  
  btnPdf: { width: 150, backgroundColor: '#E67E22', padding: 12, borderRadius: 8, alignItems: 'center' },
  btnPdfTexto: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
  
  fazendaHeader: { backgroundColor: '#FFFFFF', padding: 15, marginTop: 15, borderTopLeftRadius: 12, borderTopRightRadius: 12, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 3, borderBottomColor: '#2C3E50', elevation: 1 },
  fazendaTitulo: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50' },
  fazendaTotal: { fontSize: 16, fontWeight: 'bold', color: '#27AE60' },
  
  quadraHeader: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#EAEDED', padding: 10, borderBottomWidth: 1, borderBottomColor: '#D5DBDB', marginTop: 5 },
  quadraTitulo: { fontSize: 15, fontWeight: 'bold', color: '#34495E' },
  quadraTotal: { fontSize: 15, fontWeight: 'bold', color: '#D35400' },
  
  ramalWrapper: { backgroundColor: '#F8FAFC', paddingHorizontal: 10 }, 
  ramalItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F2F4F4', alignItems: 'center' },
  ramalTexto: { fontSize: 14, color: '#2C3E50', fontWeight: 'bold' },
  
  miniLabel: { fontSize: 14, color: '#7F8C8D', marginTop: 4, fontWeight: 'bold' },
  miniPickerContainer: { backgroundColor: '#D4E6F1', borderRadius: 6, marginTop: 4, height: 60, justifyContent: 'center', overflow: 'hidden' },
  pickerBloqueado: { backgroundColor: '#EAECEE', opacity: 0.8 }, 
  miniPicker: { height: 60, color: '#2980B9', width: '100%', fontWeight: 'bold', fontSize: 12 },

  inputEditQtd: { backgroundColor: '#EAEDED', color: '#2C3E50', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, marginTop: 4, fontSize: 14, fontWeight: 'bold', textAlign: 'center', minWidth: 80, borderWidth: 1, borderColor: '#BDC3C7' },
  inputBloqueado: { backgroundColor: '#F8FAFC', color: '#95A5A6', borderColor: 'transparent' },

  resumoCard: { backgroundColor: '#FFF', borderRadius: 10, marginBottom: 15, elevation: 2, borderWidth: 1, borderColor: '#BDC3C7', overflow: 'hidden' },
  resumoHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: '#2C3E50', alignItems: 'center' },
  resumoFazendaNome: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  resumoFazendaTotal: { color: '#2ECC71', fontSize: 16, fontWeight: 'bold' },
  resumoVerMais: { color: '#BDC3C7', fontSize: 12, marginTop: 4 },
  resumoQuadrasContainer: { padding: 10, backgroundColor: '#F8FAFC' },
  resumoQuadraRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#EAEDED' },
  resumoQuadraNome: { color: '#34495E', fontSize: 15, fontWeight: 'bold' },
  resumoQuadraTotal: { color: '#D35400', fontSize: 15, fontWeight: 'bold' }
});