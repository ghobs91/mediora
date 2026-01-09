import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SonarrQualityProfile, RadarrQualityProfile } from '../types';

interface QualityProfileSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (profileId: number) => void;
  profiles: SonarrQualityProfile[] | RadarrQualityProfile[];
  title?: string;
  selectedProfileId?: number;
}

export function QualityProfileSelector({
  visible,
  onClose,
  onSelect,
  profiles,
  title = 'Select Quality Profile',
  selectedProfileId,
}: QualityProfileSelectorProps) {
  const [localSelectedId, setLocalSelectedId] = useState<number | undefined>(selectedProfileId);

  useEffect(() => {
    setLocalSelectedId(selectedProfileId);
  }, [selectedProfileId]);

  const handleSelect = (profileId: number) => {
    setLocalSelectedId(profileId);
    onSelect(profileId);
    onClose();
  };

  const renderProfile = ({ item }: { item: SonarrQualityProfile | RadarrQualityProfile }) => (
    <TouchableOpacity
      style={[
        styles.profileItem,
        localSelectedId === item.id && styles.profileItemSelected,
      ]}
      onPress={() => handleSelect(item.id)}>
      <Text style={styles.profileName}>{item.name}</Text>
      {localSelectedId === item.id && (
        <Icon name="checkmark" size={24} color="#fff" />
      )}
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {profiles.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No quality profiles available</Text>
            </View>
          ) : (
            <FlatList
              data={profiles}
              renderItem={renderProfile}
              keyExtractor={(item) => item.id.toString()}
              style={styles.list}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    width: '80%',
    maxWidth: 600,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
  },
  closeButton: {
    padding: 8,
  },
  list: {
    maxHeight: 400,
  },
  profileItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  profileItemSelected: {
    backgroundColor: '#e50914',
  },
  profileName: {
    fontSize: 18,
    color: '#fff',
    flex: 1,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
  },
});
