// Powered by OnSpace.AI
import React, { useState, useCallback } from 'react';
import {
  View, StyleSheet, Pressable, Text, ScrollView, Modal,
  TextInput, Switch, Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAutomation } from '@/hooks/useAutomation';
import { useCanvas } from '@/hooks/useCanvas';
import { useTheme } from '@/hooks/useTheme';
import { AUTOMATION_TEMPLATES, Automation } from '@/services/automationService';
import { Tool } from '@/contexts/CanvasContext';

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manuel',
  on_open: 'À l\'ouverture',
  on_save: 'À la sauvegarde',
};

interface Props {
  canvasId?: string;
}

const AutomationPanel: React.FC<Props> = ({ canvasId }) => {
  const { theme } = useTheme();
  const {
    automations, recording, recordedStrokes,
    removeAutomation, toggleEnabled, addFromTemplate,
    startRecording, stopRecording, cancelRecording,
    executeAutomation,
  } = useAutomation();
  const {
    setActiveTool, setActiveColor, setBrushSize, fillLayer, clearLayer,
    activeLayerId, loadLayers, layers, activeLayerId: alid,
  } = useCanvas();

  const [showTemplates, setShowTemplates] = useState(false);
  const [recordingName, setRecordingName] = useState('');
  const [showSaveRecording, setShowSaveRecording] = useState(false);

  const styles = makeStyles(theme);

  const execCtx = {
    setTool: (t: string) => setActiveTool(t as Tool),
    setColor: setActiveColor,
    setBrushSize,
    fillLayer,
    clearLayer,
    replayStrokes: (strokes: any[]) => {
      // Replay strokes by adding them to current layer
      const newStrokes = strokes.map((s, i) => ({
        ...s,
        id: `replay-${Date.now()}-${i}`,
        layerId: activeLayerId,
      }));
      // We use a direct layer update hack via loadLayers
      const updatedLayers = layers.map(l =>
        l.id === activeLayerId ? { ...l, strokes: [...l.strokes, ...newStrokes] } : l
      );
      loadLayers(canvasId ?? 'replay', updatedLayers, activeLayerId);
    },
    activeLayerId,
  };

  const handleStopRecording = () => {
    setRecordingName(`Macro ${Date.now().toString().slice(-4)}`);
    setShowSaveRecording(true);
  };

  const handleSaveRecording = async () => {
    setShowSaveRecording(false);
    await stopRecording(recordingName, canvasId);
  };

  return (
    <View style={styles.container}>
      {/* Recording banner */}
      {recording && (
        <View style={styles.recordingBanner}>
          <View style={styles.recDot} />
          <Text style={styles.recText}>Enregistrement... {recordedStrokes.length} traits</Text>
          <Pressable style={styles.recStopBtn} onPress={handleStopRecording}>
            <MaterialCommunityIcons name="stop" size={14} color="#fff" />
            <Text style={styles.recStopText}>Stop</Text>
          </Pressable>
          <Pressable style={styles.recCancelBtn} onPress={cancelRecording} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={14} color={theme.textMuted} />
          </Pressable>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Actions */}
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionBtn, recording && styles.actionBtnActive]}
            onPress={recording ? handleStopRecording : startRecording}
          >
            <MaterialCommunityIcons
              name={recording ? 'stop-circle' : 'record-circle-outline'}
              size={16}
              color={recording ? '#ff4444' : theme.accent}
            />
            <Text style={[styles.actionBtnText, { color: recording ? '#ff4444' : theme.accent }]}>
              {recording ? 'Arrêter' : 'Enregistrer'}
            </Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => setShowTemplates(true)}
          >
            <MaterialCommunityIcons name="lightning-bolt-outline" size={16} color={theme.textSecondary} />
            <Text style={[styles.actionBtnText, { color: theme.textSecondary }]}>Modèles</Text>
          </Pressable>
        </View>

        {/* Automations list */}
        {automations.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="robot-outline" size={36} color={theme.textMuted} />
            <Text style={styles.emptyText}>Aucune automation</Text>
            <Text style={styles.emptyHint}>Enregistrez des traits ou utilisez des modèles</Text>
          </View>
        ) : (
          automations.map(auto => (
            <AutomationCard
              key={auto.id}
              automation={auto}
              theme={theme}
              styles={styles}
              onExecute={() => executeAutomation(auto.id, execCtx)}
              onToggle={(v) => toggleEnabled(auto.id, v)}
              onDelete={() => removeAutomation(auto.id)}
            />
          ))
        )}

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Templates modal */}
      <Modal visible={showTemplates} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowTemplates(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Modèles d&apos;automations</Text>
            {AUTOMATION_TEMPLATES.map((tpl, i) => (
              <Pressable
                key={i}
                style={styles.templateRow}
                onPress={async () => {
                  await addFromTemplate(i);
                  setShowTemplates(false);
                }}
              >
                <View style={[styles.tplIcon, { backgroundColor: tpl.color + '33' }]}>
                  <MaterialCommunityIcons name={tpl.icon as any} size={18} color={tpl.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tplName}>{tpl.name}</Text>
                  <Text style={styles.tplDesc}>{tpl.description}</Text>
                </View>
                <MaterialCommunityIcons name="plus" size={18} color={theme.accent} />
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Save recording modal */}
      <Modal visible={showSaveRecording} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowSaveRecording(false)}>
          <View style={[styles.modalSheet, { paddingBottom: 24 }]} onStartShouldSetResponder={() => true}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>Sauvegarder la macro</Text>
            <Text style={styles.tplDesc}>{recordedStrokes.length} trait(s) enregistré(s)</Text>
            <TextInput
              style={styles.nameInput}
              value={recordingName}
              onChangeText={setRecordingName}
              placeholder="Nom de l'automation..."
              placeholderTextColor={theme.textMuted}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => { setShowSaveRecording(false); cancelRecording(); }}>
                <Text style={{ color: theme.textSecondary, fontWeight: '600', fontSize: 14 }}>Annuler</Text>
              </Pressable>
              <Pressable style={[styles.cancelBtn, { backgroundColor: theme.accent }]} onPress={handleSaveRecording}>
                <Text style={{ color: '#0d0d0d', fontWeight: '700', fontSize: 14 }}>Sauvegarder</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

function AutomationCard({ automation, theme, styles, onExecute, onToggle, onDelete }: {
  automation: Automation;
  theme: any;
  styles: any;
  onExecute: () => void;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.autoCard}>
      <View style={[styles.autoIcon, { backgroundColor: automation.color + '33' }]}>
        <MaterialCommunityIcons name={automation.icon as any} size={18} color={automation.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.autoName} numberOfLines={1}>{automation.name}</Text>
        <Text style={styles.autoTrigger}>
          {TRIGGER_LABELS[automation.trigger]} · {automation.actions.length} action(s)
        </Text>
      </View>
      <Switch
        value={automation.enabled}
        onValueChange={onToggle}
        trackColor={{ false: '#333', true: theme.accent }}
        thumbColor="#fff"
        style={{ transform: [{ scale: 0.75 }] }}
      />
      {automation.trigger === 'manual' && (
        <Pressable
          style={({ pressed }) => [styles.runBtn, pressed && { opacity: 0.7 }]}
          onPress={onExecute}
          hitSlop={8}
        >
          <MaterialCommunityIcons name="play" size={14} color="#0d0d0d" />
        </Pressable>
      )}
      <Pressable
        style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}
        onPress={onDelete}
        hitSlop={8}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={14} color={theme.danger} />
      </Pressable>
    </View>
  );
}

function makeStyles(theme: any) {
  return StyleSheet.create({
    container: { flex: 1 },
    recordingBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: '#ff444422', borderRadius: 8, margin: 8,
      padding: 8, borderWidth: 1, borderColor: '#ff4444',
    },
    recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff4444' },
    recText: { flex: 1, fontSize: 11, color: '#ff6666', fontWeight: '600' },
    recStopBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: '#ff4444', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    },
    recStopText: { fontSize: 11, color: '#fff', fontWeight: '700' },
    recCancelBtn: { padding: 2 },
    actionRow: { flexDirection: 'row', gap: 8, padding: 8 },
    actionBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 8, borderRadius: 10,
      backgroundColor: theme.surfaceHigh, borderWidth: 1, borderColor: theme.surfaceBorder,
    },
    actionBtnActive: { borderColor: '#ff4444' },
    actionBtnText: { fontSize: 12, fontWeight: '600' },
    emptyState: { alignItems: 'center', paddingVertical: 32, gap: 6 },
    emptyText: { fontSize: 14, color: theme.textSecondary, fontWeight: '600' },
    emptyHint: { fontSize: 11, color: theme.textMuted, textAlign: 'center' },
    autoCard: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 8, marginBottom: 6,
      backgroundColor: theme.cardBg, borderRadius: 10,
      padding: 10, borderWidth: 1, borderColor: theme.surfaceBorder,
    },
    autoIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    autoName: { fontSize: 12, color: theme.textPrimary, fontWeight: '600' },
    autoTrigger: { fontSize: 10, color: theme.textMuted, marginTop: 1 },
    runBtn: {
      width: 26, height: 26, borderRadius: 13,
      backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center',
    },
    deleteBtn: {
      width: 26, height: 26, borderRadius: 8,
      backgroundColor: theme.surfaceHigh, alignItems: 'center', justifyContent: 'center',
    },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 20, gap: 10, borderTopWidth: 1, borderColor: theme.surfaceBorder,
    },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.surfaceBorder, alignSelf: 'center', marginBottom: 4 },
    modalTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
    templateRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.surfaceBorder,
    },
    tplIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    tplName: { fontSize: 13, color: theme.textPrimary, fontWeight: '600' },
    tplDesc: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
    nameInput: {
      backgroundColor: theme.surfaceHigh, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 10,
      fontSize: 14, color: theme.textPrimary,
      borderWidth: 1, borderColor: theme.surfaceBorder,
    },
    modalActions: { flexDirection: 'row', gap: 10 },
    cancelBtn: {
      flex: 1, height: 44, borderRadius: 10,
      backgroundColor: theme.surfaceHigh, alignItems: 'center', justifyContent: 'center',
    },
  });
}

export default React.memo(AutomationPanel);
