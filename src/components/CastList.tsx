import React from 'react';
import { View, Text, Image, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { TMDBCast } from '../types';
import { scaleSize, scaleFontSize } from '../utils/scaling';

interface CastListProps {
    cast: TMDBCast[];
    onPress?: (person: TMDBCast) => void;
}

export function CastList({ cast, onPress }: CastListProps) {
    if (!cast || cast.length === 0) return null;

    const renderItem = ({ item }: { item: TMDBCast }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => onPress?.(item)}
            activeOpacity={0.7}
            disabled={!onPress}
            focusable={true}
        >
            <View style={styles.imageContainer}>
                {item.profile_path ? (
                    <Image
                        source={{ uri: `https://image.tmdb.org/t/p/w185${item.profile_path}` }}
                        style={styles.image}
                        resizeMode="cover"
                    />
                ) : (
                    <View style={styles.placeholder}>
                        <Text style={styles.initials}>
                            {item.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </Text>
                    </View>
                )}
            </View>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.character} numberOfLines={1}>{item.character}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Cast and Crew</Text>
            <FlatList
                data={cast}
                renderItem={renderItem}
                keyExtractor={(item) => item.credit_id || String(item.id)}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginVertical: scaleSize(20),
    },
    header: {
        color: '#fff',
        fontSize: scaleFontSize(20),
        fontWeight: '700',
        marginBottom: scaleSize(16),
    },
    listContent: {
        paddingRight: scaleSize(20),
    },
    card: {
        width: scaleSize(120),
        alignItems: 'center',
        marginRight: scaleSize(16),
    },
    imageContainer: {
        width: scaleSize(120),
        height: scaleSize(120),
        borderRadius: scaleSize(60),
        overflow: 'hidden',
        marginBottom: scaleSize(8),
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    placeholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    initials: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: scaleFontSize(24),
        fontWeight: '600',
    },
    name: {
        color: '#fff',
        fontSize: scaleFontSize(14),
        fontWeight: '600',
        textAlign: 'center',
        width: '100%',
    },
    character: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: scaleFontSize(12),
        textAlign: 'center',
        width: '100%',
        marginTop: scaleSize(2),
    },
});
