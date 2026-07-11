import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import React, { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, InteractionManager, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../src/supabase';

const alertaWebMobile = (titulo: string, mensagem: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${titulo}\n\n${mensagem}`);
  } else {
    Alert.alert(titulo, mensagem);
  }
};

const confirmacaoWebMobile = (titulo: string, mensagem: string, aoConfirmar: () => void) => {
  if (Platform.OS === 'web') {
    const confirmado = window.confirm(`${titulo}\n\n${mensagem}`);
    if (confirmado) aoConfirmar();
  } else {
    Alert.alert(titulo, mensagem, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sim', style: 'destructive', onPress: aoConfirmar }
    ]);
  }
};

// =========================================================================
// COMPONENTES MEMOIZADOS
// =========================================================================
const ItemMapa = memo(({ item, onEditar, onExcluir }: any) => (
  <View style={styles.itemLista}>
    <View style={{flex: 1}}>
      <Text style={styles.itemNome}>Fz: {item.fazenda} | Q: {item.quadra} | R: {item.ramal}</Text>
      <Text style={styles.itemDetalhe}>Capacidade: {item.total_pes} pés</Text>
      <Text style={styles.itemDetalhe}>Serviço Autorizado: {item.servico_permitido || 'Livre'}</Text>
    </View>
    <View style={{flexDirection: 'row', gap: 15}}>
      <TouchableOpacity onPress={() => onEditar(item)}><Text style={styles.iconeAcao}>✏️</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => onExcluir(item.id, item.fazenda, item.ramal)}><Text style={styles.iconeAcao}>🗑️</Text></TouchableOpacity>
    </View>
  </View>
));

export default function CadastrosScreen() {
  const [abaAtiva, setAbaAtiva] = useState<'colaborador' | 'servico' | 'mapa' | 'setor'>('servico');
  const [salvando, setSalvando] = useState(false);
  
  const [listaServicos, setListaServicos] = useState<any[]>([]);
  const [listaSetores, setListaSetores] = useState<any[]>([]); 
  const [listaMapas, setListaMapas] = useState<any[]>([]); 
  
  const [fazendasUnicas, setFazendasUnicas] = useState<string[]>([]);

  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const tarefa = InteractionManager.runAfterInteractions(() => {
      verificarPerfil();
      carregarServicos();
      carregarSetores();
      carregarMapas();
    });
    return () => tarefa.cancel();
  }, []);

  const verificarPerfil = async () => {
    const perfilSalvo = await AsyncStorage.getItem('@perfil_offline');
    if (perfilSalvo) {
      const perfil = JSON.parse(perfilSalvo);
      setIsAdmin(perfil.cargo === 'Administrador');
    }
  };

  const carregarServicos = async () => {
    const { data } = await supabase.from('servicos').select('*').order('nome');
    if (data) setListaServicos(data);
  };

  const carregarSetores = async () => {
    const { data } = await supabase.from('setores').select('*').order('nome');
    if (data) setListaSetores(data);
  };

  const carregarMapas = async () => {
    const { data: ultimosMapas } = await supabase
      .from('mapa_fazendas')
      .select('*')
      .order('id', { ascending: false })
      .limit(50); 

    if (ultimosMapas) {
      setListaMapas(ultimosMapas);
    }

    const { data: fazendas } = await supabase
      .from('mapa_fazendas')
      .select('fazenda')
      .order('id', { ascending: false })
      .limit(5000);

    if (fazendas) {
      const unicas = [...new Set(fazendas.map(item => item.fazenda).filter(Boolean))] as string[];
      setFazendasUnicas(unicas);
    }
  };

  // === ESTADOS: COLABORADOR ===
  const [nomeColaborador, setNomeColaborador] = useState('');
  const [setorColaborador, setSetorColaborador] = useState('');
  const [dataAdmissao, setDataAdmissao] = useState('');

  // === ESTADOS: SERVIÇO ===
  const [nomeServico, setNomeServico] = useState('');
  const [precoServico, setPrecoServico] = useState('');
  const [tipoCobranca, setTipoCobranca] = useState('milheiro');
  const [isCoringa, setIsCoringa] = useState('nao'); 
  const [permiteMultiplos, setPermiteMultiplos] = useState('nao'); // 👉 NOVO ESTADO AQUI
  const [editandoServicoId, setEditandoServicoId] = useState<number | null>(null);

  // === ESTADOS: MAPA ===
  const [nomeFazendaSelecionada, setNomeFazendaSelecionada] = useState(''); 
  const [nomeFazendaDigitada, setNomeFazendaDigitada] = useState(''); 
  const [numeroQuadra, setNumeroQuadra] = useState('');
  const [numeroRamal, setNumeroRamal] = useState('');
  const [totalPes, setTotalPes] = useState('');
  const [servicoVinculado, setServicoVinculado] = useState('');
  const [editandoMapaId, setEditandoMapaId] = useState<number | null>(null);

  // === ESTADOS: SETOR ===
  const [nomeSetor, setNomeSetor] = useState('');
  const [editandoSetorId, setEditandoSetorId] = useState<number | null>(null);

  const aplicarMascaraData = (texto: string) => {
    let v = texto.replace(/\D/g, ''); 
    if (v.length > 8) v = v.substring(0, 8); 
    if (v.length > 4) v = v.replace(/^(\d{2})(\d{2})(\d{1,4}).*/, '$1/$2/$3');
    else if (v.length > 2) v = v.replace(/^(\d{2})(\d{1,2}).*/, '$1/$2');
    return v;
  };

  const converterParaBanco = (dataBR: string) => {
    const partes = dataBR.split('/');
    if (partes.length === 3) return `${partes[2]}-${partes[1]}-${partes[0]}`;
    return null;
  };

  const salvarColaborador = async () => {
    if (!nomeColaborador || !dataAdmissao || !setorColaborador) {
      return alertaWebMobile('Erro', 'Preencha o nome, data e setor.');
    }
    if (dataAdmissao.length !== 10) return alertaWebMobile('Erro', 'Data incompleta.');
    
    setSalvando(true);
    const dataFormatada = converterParaBanco(dataAdmissao);
    
    const { error } = await supabase.from('colaboradores').insert([{ 
      nome: nomeColaborador.toUpperCase(),
      setor: setorColaborador,
      data_admissao: dataFormatada
    }]);
    
    setSalvando(false);
    if (!error) { 
      alertaWebMobile('Sucesso', 'Cadastrado com sucesso!'); 
      setNomeColaborador(''); setDataAdmissao(''); setSetorColaborador('');
    } else {
      alertaWebMobile('Erro', error.message);
    }
  };

  const salvarServico = async () => {
    if (!nomeServico || !precoServico) return alertaWebMobile('Erro', 'Preencha nome e preço.');
    setSalvando(true);
    
    const precoFormatado = parseFloat(precoServico.replace(',', '.'));
    const coringaBool = isCoringa === 'sim'; 
    const multiplosBool = permiteMultiplos === 'sim'; // 👉 NOVO
    
    const payload = { 
      nome: nomeServico, 
      preco_base: precoFormatado, 
      tipo_cobranca: tipoCobranca,
      is_coringa: coringaBool,
      permite_multiplos: multiplosBool // 👉 SALVANDO NO BANCO
    };

    let error;

    if (editandoServicoId) {
      const { error: errUpdate } = await supabase.from('servicos').update(payload).eq('id', editandoServicoId);
      error = errUpdate;
    } else {
      const { error: errInsert } = await supabase.from('servicos').insert([payload]);
      error = errInsert;
    }
    
    setSalvando(false);
    if (!error) { 
      alertaWebMobile('Sucesso', editandoServicoId ? 'Serviço atualizado!' : 'Serviço cadastrado!'); 
      cancelarEdicaoServico();
      carregarServicos(); 
    } else {
      alertaWebMobile('Erro', error.message);
    }
  };

  const alternarBloqueioDeServico = async (id: number, bloqueadoAtual: boolean) => {
    if (!isAdmin) {
      return alertaWebMobile("Acesso Negado", "Apenas Administradores podem bloquear ou liberar serviços.");
    }
    
    const novoStatus = !bloqueadoAtual;
    setListaServicos(listaServicos.map(s => s.id === id ? { ...s, bloqueado: novoStatus } : s));

    const { error } = await supabase.from('servicos').update({ bloqueado: novoStatus }).eq('id', id);
    if (error) {
      alertaWebMobile("Erro", "Falha ao mudar o status.");
      carregarServicos(); 
    }
  };

  const salvarMapa = async () => {
    const fazendaFinal = nomeFazendaSelecionada === 'NOVA_FAZENDA' ? nomeFazendaDigitada.trim() : nomeFazendaSelecionada;

    if (!fazendaFinal || !numeroQuadra || !numeroRamal || !totalPes) {
      return alertaWebMobile('Erro', 'Preencha todos os campos obrigatórios do mapa (Fazenda, Quadra, Ramal e Limite de Pés)!');
    }
    
    setSalvando(true);
    
    const payload = { 
      fazenda: fazendaFinal.toUpperCase(), 
      quadra: numeroQuadra.trim(), 
      ramal: numeroRamal.trim(), 
      total_pes: parseInt(totalPes),
      servico_permitido: servicoVinculado 
    };

    let error;

    if (editandoMapaId) {
      const { error: errUpdate } = await supabase.from('mapa_fazendas').update(payload).eq('id', editandoMapaId);
      error = errUpdate;
    } else {
      const { error: errInsert } = await supabase.from('mapa_fazendas').insert([payload]);
      error = errInsert;
    }

    setSalvando(false);
    
    if (error) alertaWebMobile('Erro', error.message);
    else {
      alertaWebMobile('Sucesso', editandoMapaId ? 'Ramal atualizado!' : 'Ramal cadastrado!');
      cancelarEdicaoMapa();
      carregarMapas();
    }
  };

  const salvarSetor = async () => {
    if (!nomeSetor) return alertaWebMobile('Erro', 'Digite o nome do setor.');
    setSalvando(true);
    
    const payload = { nome: nomeSetor };
    let error;

    if (editandoSetorId) {
      const { error: errUpdate } = await supabase.from('setores').update(payload).eq('id', editandoSetorId);
      error = errUpdate;
    } else {
      const { error: errInsert } = await supabase.from('setores').insert([payload]);
      error = errInsert;
    }

    setSalvando(false);
    
    if (!error) { 
      alertaWebMobile('Sucesso', editandoSetorId ? 'Setor atualizado!' : 'Setor cadastrado!'); 
      cancelarEdicaoSetor();
      carregarSetores(); 
    } else {
      alertaWebMobile('Erro', error.message);
    }
  };

  const iniciarEdicaoServico = (item: any) => {
    setNomeServico(item.nome);
    setPrecoServico(item.preco_base ? item.preco_base.toString().replace('.', ',') : '');
    setTipoCobranca(item.tipo_cobranca || 'milheiro');
    setIsCoringa(item.is_coringa ? 'sim' : 'nao');
    setPermiteMultiplos(item.permite_multiplos ? 'sim' : 'nao'); // 👉 NOVO
    setEditandoServicoId(item.id);
  };

  const cancelarEdicaoServico = () => {
    setNomeServico(''); setPrecoServico(''); setTipoCobranca('milheiro'); setIsCoringa('nao'); setPermiteMultiplos('nao'); setEditandoServicoId(null);
  };

  const iniciarEdicaoMapa = useCallback((item: any) => {
    setNomeFazendaSelecionada(item.fazenda); 
    setNomeFazendaDigitada('');
    setNumeroQuadra(item.quadra);
    setNumeroRamal(item.ramal);
    setTotalPes(item.total_pes ? item.total_pes.toString() : '');
    setServicoVinculado(item.servico_permitido || '');
    setEditandoMapaId(item.id);
  }, []);

  const cancelarEdicaoMapa = () => {
    setNomeFazendaSelecionada(''); setNomeFazendaDigitada(''); setNumeroQuadra(''); setNumeroRamal(''); setTotalPes(''); setServicoVinculado(''); setEditandoMapaId(null);
  };

  const iniciarEdicaoSetor = (item: any) => {
    setNomeSetor(item.nome);
    setEditandoSetorId(item.id);
  };

  const cancelarEdicaoSetor = () => {
    setNomeSetor(''); setEditandoSetorId(null);
  };

  const excluirSetor = (id: number, nome: string) => {
    confirmacaoWebMobile('Excluir Setor', `Apagar o setor "${nome}"?`, async () => {
      await supabase.from('setores').delete().eq('id', id); 
      carregarSetores();
    });
  };

  const excluirServico = (id: number, nome: string) => {
    confirmacaoWebMobile('Excluir Serviço', `Apagar o serviço "${nome}"?`, async () => {
      await supabase.from('servicos').delete().eq('id', id); 
      carregarServicos();
    });
  };

  const excluirMapa = useCallback((id: number, fazenda: string, ramal: string) => {
    confirmacaoWebMobile('Excluir Ramal', `Apagar o Ramal ${ramal} da Fazenda ${fazenda}?`, async () => {
      await supabase.from('mapa_fazendas').delete().eq('id', id); 
      carregarMapas();
    });
  }, []);

  const renderFormularioMapa = () => (
    <View style={{ marginBottom: 20 }}>
      <Text style={styles.formTitle}>{editandoMapaId ? '✏️ Editando Ramal' : 'Mapear Novo Ramal'}</Text>
      
      <Text style={styles.label}>Fazenda:</Text>
      <View style={[styles.pickerContainer, { marginBottom: nomeFazendaSelecionada === 'NOVA_FAZENDA' ? 10 : 0 }]}>
        <Picker 
          selectedValue={nomeFazendaSelecionada} 
          onValueChange={(val) => {
            setNomeFazendaSelecionada(val);
            if (val !== 'NOVA_FAZENDA') setNomeFazendaDigitada(''); 
          }} 
          style={styles.picker}
        >
          <Picker.Item label="Selecione a fazenda..." value="" />
          {fazendasUnicas.map((fazenda, index) => (
            <Picker.Item key={index} label={fazenda} value={fazenda} />
          ))}
          <Picker.Item label="➕ Adicionar Nova Fazenda..." value="NOVA_FAZENDA" color="#2980B9" />
        </Picker>
      </View>

      {nomeFazendaSelecionada === 'NOVA_FAZENDA' && (
        <TextInput 
          style={styles.input} 
          placeholder="Digite o nome da NOVA fazenda" 
          value={nomeFazendaDigitada} 
          onChangeText={setNomeFazendaDigitada}
          autoCapitalize="characters"
        />
      )}

      <View style={styles.row}>
        <View style={styles.col}><Text style={styles.label}>Quadra:</Text><TextInput style={styles.input} placeholder="Ex: 12" value={numeroQuadra} onChangeText={setNumeroQuadra}/></View>
        <View style={styles.col}><Text style={styles.label}>Ramal:</Text><TextInput style={styles.input} placeholder="Ex: 5" value={numeroRamal} onChangeText={setNumeroRamal}/></View>
      </View>

      <Text style={styles.label}>Limite de Pés do Ramal:</Text>
      <TextInput style={styles.input} placeholder="Ex: 1500" keyboardType="numeric" value={totalPes} onChangeText={setTotalPes}/>

      <Text style={styles.label}>Serviço Padrão deste Ramal (Opcional):</Text>
      <View style={styles.pickerContainer}>
        <Picker selectedValue={servicoVinculado} onValueChange={setServicoVinculado} style={styles.picker}>
          <Picker.Item label="Nenhum (Livre)" value="" />
          {listaServicos.map((item) => (<Picker.Item key={item.id} label={item.nome} value={item.nome} />))}
        </Picker>
      </View>

      {editandoMapaId ? (
        <View style={styles.row}>
          <TouchableOpacity style={[styles.button, {flex: 1, marginRight: 5, backgroundColor: '#95A5A6'}]} onPress={cancelarEdicaoMapa}>
            <Text style={styles.buttonText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, {flex: 1, marginLeft: 5, backgroundColor: '#F39C12'}]} onPress={salvarMapa} disabled={salvando}>
            {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Atualizar</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.button} onPress={salvarMapa} disabled={salvando}>
          {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Salvar Ramal</Text>}
        </TouchableOpacity>
      )}

      <View style={styles.secaoLista}>
        <Text style={styles.tituloLista}>Últimos Ramais Adicionados</Text>
        <Text style={{fontSize: 12, color: '#E67E22', marginBottom: 10, fontWeight: 'bold'}}>
          Exibindo os últimos 50 ramais para poupar a memória do tablet.
        </Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        
        <View style={styles.header}>
          <Text style={styles.title}>Painel Admin ⚙️</Text>
          <Text style={styles.subtitle}>Gerenciamento do Sistema</Text>
        </View>

        <View style={styles.menuAbas}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity style={[styles.abaBotao, abaAtiva === 'servico' && styles.abaAtiva]} onPress={() => setAbaAtiva('servico')}><Text style={[styles.abaTexto, abaAtiva === 'servico' && styles.abaTextoAtivo]}>Serviços</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.abaBotao, abaAtiva === 'mapa' && styles.abaAtiva]} onPress={() => setAbaAtiva('mapa')}><Text style={[styles.abaTexto, abaAtiva === 'mapa' && styles.abaTextoAtivo]}>Mapa</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.abaBotao, abaAtiva === 'setor' && styles.abaAtiva]} onPress={() => setAbaAtiva('setor')}><Text style={[styles.abaTexto, abaAtiva === 'setor' && styles.abaTextoAtivo]}>Setores</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.abaBotao, abaAtiva === 'colaborador' && styles.abaAtiva]} onPress={() => setAbaAtiva('colaborador')}><Text style={[styles.abaTexto, abaAtiva === 'colaborador' && styles.abaTextoAtivo]}>+ Colaborador</Text></TouchableOpacity>
          </ScrollView>
        </View>

        <View style={styles.card}>
          {abaAtiva === 'colaborador' && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.formTitle}>Novo Colaborador</Text>
              <Text style={{fontSize: 12, color: '#7F8C8D', marginBottom: 15}}>A gestão e listagem de colaboradores é feita na tela "Gestão de Equipe".</Text>
              
              <Text style={styles.label}>Nome Completo:</Text>
              <TextInput style={styles.input} placeholder="Ex: JOÃO DA SILVA" value={nomeColaborador} onChangeText={setNomeColaborador} autoCapitalize="characters"/>
              
              <Text style={styles.label}>Data de Admissão:</Text>
              <TextInput style={styles.input} placeholder="DD/MM/AAAA" keyboardType="numeric" maxLength={10} value={dataAdmissao} onChangeText={(t) => setDataAdmissao(aplicarMascaraData(t))}/>
              
              <Text style={styles.label}>Setor:</Text>
              <View style={styles.pickerContainer}>
                <Picker selectedValue={setorColaborador} onValueChange={setSetorColaborador} style={styles.picker}>
                  <Picker.Item label="Selecione o setor..." value="" />
                  {listaSetores.map((item) => (
                    <Picker.Item key={item.id} label={item.nome} value={item.nome} />
                  ))}
                </Picker>
              </View>

              <TouchableOpacity style={styles.button} onPress={salvarColaborador} disabled={salvando}>
                {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Salvar</Text>}
              </TouchableOpacity>
            </ScrollView>
          )}

          {abaAtiva === 'setor' && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.formTitle}>{editandoSetorId ? '✏️ Editando Setor' : 'Novo Setor de Trabalho'}</Text>
              <Text style={styles.label}>Nome do Setor:</Text>
              <TextInput style={styles.input} placeholder="Ex: Tratos Culturais" value={nomeSetor} onChangeText={setNomeSetor}/>
              
              {editandoSetorId ? (
                <View style={styles.row}>
                  <TouchableOpacity style={[styles.button, {flex: 1, marginRight: 5, backgroundColor: '#95A5A6'}]} onPress={cancelarEdicaoSetor}>
                    <Text style={styles.buttonText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.button, {flex: 1, marginLeft: 5, backgroundColor: '#F39C12'}]} onPress={salvarSetor} disabled={salvando}>
                    {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Atualizar</Text>}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.button} onPress={salvarSetor} disabled={salvando}>
                  {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Salvar Setor</Text>}
                </TouchableOpacity>
              )}

              <View style={styles.secaoLista}>
                <Text style={styles.tituloLista}>Setores Cadastrados ({listaSetores.length})</Text>
                {listaSetores.map(item => (
                  <View key={item.id} style={styles.itemLista}>
                    <Text style={styles.itemNome}>{item.nome}</Text>
                    <View style={{flexDirection: 'row', gap: 15}}>
                      <TouchableOpacity onPress={() => iniciarEdicaoSetor(item)}><Text style={styles.iconeAcao}>✏️</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => excluirSetor(item.id, item.nome)}><Text style={styles.iconeAcao}>🗑️</Text></TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {abaAtiva === 'servico' && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.formTitle}>{editandoServicoId ? '✏️ Editando Serviço' : 'Novo Serviço'}</Text>
              <Text style={styles.label}>Nome:</Text>
              <TextInput style={styles.input} placeholder="Ex: Roçada" value={nomeServico} onChangeText={setNomeServico}/>
              
              <View style={styles.row}>
                <View style={styles.col}><Text style={styles.label}>Preço Base:</Text><TextInput style={styles.input} placeholder="60,00" value={precoServico} onChangeText={setPrecoServico}/></View>
                <View style={styles.col}>
                  <Text style={styles.label}>Cobrado por:</Text>
                  <TouchableOpacity style={[styles.input, {justifyContent: 'center', backgroundColor: tipoCobranca === 'milheiro' ? '#D4E6F1' : '#F8FAFC'}]} onPress={() => setTipoCobranca(tipoCobranca === 'milheiro' ? 'unidade' : 'milheiro')}>
                    <Text style={{textAlign: 'center'}}>{tipoCobranca === 'milheiro' ? '1000 Pés' : 'Dia/Und.'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.label}>É um Serviço Coringa? (Fura bloqueio do ramal)</Text>
              <View style={styles.pickerContainer}>
                <Picker selectedValue={isCoringa} onValueChange={setIsCoringa} style={styles.picker}>
                  <Picker.Item label="Não (Segue a trava do ramal)" value="nao" />
                  <Picker.Item label="Sim (Livre em qualquer ramal)" value="sim" />
                </Picker>
              </View>

              {/* 👉 NOVO CAMPO PARA O ADMINISTRADOR */}
              <Text style={styles.label}>Permite selecionar Múltiplos Ramais no app?</Text>
              <View style={styles.pickerContainer}>
                <Picker selectedValue={permiteMultiplos} onValueChange={setPermiteMultiplos} style={styles.picker}>
                  <Picker.Item label="Não (Apenas 1 ramal por vez)" value="nao" />
                  <Picker.Item label="Sim (Libera seleção de vários ramais)" value="sim" />
                </Picker>
              </View>

              {editandoServicoId ? (
                <View style={styles.row}>
                  <TouchableOpacity style={[styles.button, {flex: 1, marginRight: 5, backgroundColor: '#95A5A6'}]} onPress={cancelarEdicaoServico}>
                    <Text style={styles.buttonText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.button, {flex: 1, marginLeft: 5, backgroundColor: '#F39C12'}]} onPress={salvarServico} disabled={salvando}>
                    {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Atualizar</Text>}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.button} onPress={salvarServico} disabled={salvando}>
                  {salvando ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Salvar</Text>}
                </TouchableOpacity>
              )}

              <View style={styles.secaoLista}>
                <Text style={styles.tituloLista}>Serviços Cadastrados ({listaServicos.length})</Text>
                {listaServicos.map(item => (
                  <View key={item.id} style={[styles.itemLista, item.bloqueado && { backgroundColor: '#FDEDEC', borderColor: '#E74C3C' }]}>
                    <View style={{flex: 1}}>
                      <Text style={[styles.itemNome, item.bloqueado && { color: '#C0392B', textDecorationLine: 'line-through' }]}>
                        {item.nome} {item.is_coringa ? '🃏' : ''}
                      </Text>
                      <Text style={styles.itemDetalhe}>
                        R$ {item.preco_base?.toFixed(2)} por {item.tipo_cobranca === 'milheiro' ? '1000 Pés' : 'Unidade'}
                        {item.permite_multiplos ? ' • [Múltiplos Ramais]' : ''}
                      </Text>
                      {item.bloqueado && <Text style={{fontSize: 10, color: '#C0392B', fontWeight: 'bold', marginTop: 2}}>BLOQUEADO PARA FISCAIS</Text>}
                    </View>
                    
                    <View style={{flexDirection: 'row', gap: 10, alignItems: 'center'}}>
                      {isAdmin && (
                        <Switch
                          trackColor={{ false: "#27AE60", true: "#E74C3C" }} 
                          thumbColor="#FFF"
                          onValueChange={() => alternarBloqueioDeServico(item.id, item.bloqueado)}
                          value={item.bloqueado === true}
                        />
                      )}
                      <TouchableOpacity onPress={() => iniciarEdicaoServico(item)}><Text style={styles.iconeAcao}>✏️</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => excluirServico(item.id, item.nome)}><Text style={styles.iconeAcao}>🗑️</Text></TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {abaAtiva === 'mapa' && (
            <FlatList
              data={listaMapas}
              keyExtractor={(item) => item.id.toString()}
              ListHeaderComponent={renderFormularioMapa()}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              renderItem={({ item }) => (
                <ItemMapa 
                  item={item} 
                  onEditar={iniciarEdicaoMapa} 
                  onExcluir={excluirMapa} 
                />
              )}
            />
          )}

        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', padding: 20 },
  header: { marginBottom: 20, marginTop: 20, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2C3E50' },
  subtitle: { fontSize: 16, color: '#7F8C8D', marginTop: 5 },
  menuAbas: { flexDirection: 'row', backgroundColor: '#E0E6ED', borderRadius: 10, padding: 4, marginBottom: 20, maxHeight: 50 },
  abaBotao: { paddingHorizontal: 15, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  abaAtiva: { backgroundColor: '#FFFFFF', elevation: 2 },
  abaTexto: { fontWeight: 'bold', color: '#7F8C8D' },
  abaTextoAtivo: { color: '#2980B9' },
  card: { flex: 1, backgroundColor: '#FFFFFF', padding: 20, borderRadius: 15, elevation: 5 },
  formTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3E50', marginBottom: 15, borderBottomWidth: 1, paddingBottom: 10 },
  label: { fontSize: 14, fontWeight: '700', color: '#34495E', marginBottom: 5, marginTop: 15 },
  input: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#F8FAFC', height: 50 },
  pickerContainer: { borderWidth: 1, borderColor: '#E0E6ED', borderRadius: 8, backgroundColor: '#F8FAFC', overflow: 'hidden' },
  picker: { height: 50, width: '100%', borderWidth: 0, backgroundColor: 'transparent' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  col: { width: '48%' },
  button: { backgroundColor: '#2980B9', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 25 },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  secaoLista: { marginTop: 40, borderTopWidth: 1, borderColor: '#E0E6ED', paddingTop: 20 },
  tituloLista: { fontSize: 16, fontWeight: 'bold', color: '#34495E', marginBottom: 15 },
  itemLista: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#E0E6ED' },
  itemNome: { fontSize: 15, fontWeight: 'bold', color: '#2C3E50' },
  itemDetalhe: { fontSize: 12, color: '#7F8C8D', marginTop: 2 },
  iconeAcao: { fontSize: 20 }
});