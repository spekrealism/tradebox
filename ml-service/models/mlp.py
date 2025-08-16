import os
import numpy as np
from sklearn.neural_network import MLPClassifier


def build_mlp(max_iter: int = None) -> MLPClassifier:
    if max_iter is None:
        max_iter = int(os.getenv('MLP_MAX_ITER', '300'))

    model = MLPClassifier(
        hidden_layer_sizes=(100, 50, 25),
        activation='relu',
        solver='adam',
        alpha=0.001,
        batch_size='auto',
        learning_rate='constant',
        learning_rate_init=0.001,
        max_iter=max_iter,
        random_state=42,
    )
    return model


def train_mlp(X_scaled: np.ndarray, y_labels: np.ndarray, max_iter: int = None) -> MLPClassifier:
    model = build_mlp(max_iter=max_iter)
    model.fit(X_scaled, y_labels)
    return model


