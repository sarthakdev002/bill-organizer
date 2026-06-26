import { BorderRadius, Colors, Spacing } from '@/constants/Theme';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

interface CustomAlertButton {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
}

interface CustomAlertProps {
    visible: boolean;
    title: string;
    message: string;
    type?: 'info' | 'success' | 'error';
    buttons?: CustomAlertButton[];
    onClose?: () => void;
}

export default function CustomAlert({ visible, title, message, type = 'info', buttons, onClose }: CustomAlertProps) {
    if (!visible) return null;

    const defaultButtons: CustomAlertButton[] = buttons || [
        { text: 'OK', onPress: onClose, style: 'default' }
    ];

    const renderIcon = () => {
        switch (type) {
            case 'success': return <Ionicons name="checkmark-circle-outline" size={32} color="#666" />;
            case 'error': return <Ionicons name="warning-outline" size={32} color="#666" />;
            default: return <Ionicons name="information-circle-outline" size={32} color="#666" />;
        }
    };

    return (
        <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <Animated.View
                    entering={FadeIn}
                    exiting={FadeOut}
                    style={StyleSheet.absoluteFill}
                >
                    <BlurView intensity={30} style={StyleSheet.absoluteFill} tint="dark" />
                </Animated.View>

                <Animated.View
                    entering={FadeInDown.duration(400)}
                    exiting={FadeOut}
                    style={styles.alertContainer}
                >
                    <BlurView intensity={70} style={StyleSheet.absoluteFill} tint="dark" />
                    <View style={styles.content}>
                        <View style={styles.iconWrapper}>
                            {renderIcon()}
                        </View>
                        <Text style={styles.title}>{title}</Text>
                        <Text style={styles.message}>{message}</Text>
                    </View>

                    <View style={styles.buttonContainer}>
                        {defaultButtons.map((button, index) => (
                            <TouchableOpacity
                                key={index}
                                style={[
                                    styles.button,
                                    index > 0 && styles.buttonBorder,
                                    button.style === 'destructive' && styles.buttonDestructive
                                ]}
                                onPress={async () => {
                                    if (button.onPress) await button.onPress();
                                    if (onClose) onClose();
                                }}
                            >
                                <Text style={[
                                    styles.buttonText,
                                    button.style === 'destructive' && styles.buttonTextDestructive,
                                    button.style === 'cancel' && styles.buttonTextCancel
                                ]}>
                                    {button.text}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
    alertContainer: {
        backgroundColor: 'rgba(15, 23, 42, 0.65)', // Slate 900
        borderRadius: BorderRadius.xl,
        width: '100%',
        maxWidth: 320,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
        overflow: 'hidden',
    },
    content: {
        paddingTop: Spacing.xl,
        paddingBottom: Spacing.lg,
        paddingHorizontal: Spacing.xl,
        alignItems: 'center',
    },
    iconWrapper: {
        marginBottom: Spacing.md,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        padding: Spacing.md,
        borderRadius: 24,
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        color: Colors.white,
        textAlign: 'center',
        marginBottom: Spacing.xs,
        letterSpacing: -0.5,
    },
    message: {
        fontSize: 15,
        color: 'rgba(255, 255, 255, 0.8)',
        textAlign: 'center',
        lineHeight: 22,
        fontWeight: '500',
    },
    buttonContainer: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.1)',
    },
    button: {
        flex: 1,
        paddingVertical: Spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonBorder: {
        borderLeftWidth: 1,
        borderLeftColor: 'rgba(255, 255, 255, 0.1)',
    },
    buttonDestructive: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#818CF8', // Indigo 400
    },
    buttonTextDestructive: {
        color: '#F87171', // Red 400
    },
    buttonTextCancel: {
        color: 'rgba(255, 255, 255, 0.4)',
        fontWeight: '600',
    },
});
