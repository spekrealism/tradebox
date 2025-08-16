import numpy as np
import tensorflow as tf
from tensorflow.keras.layers import (
    Dense,
    Dropout,
    MultiHeadAttention,
    LayerNormalization,
    Input,
    Embedding,
    GlobalAveragePooling1D,
)


def build_transformer_model(seq_len: int = 60, d_model: int = 64, num_heads: int = 4,
                            ff_dim: int = 128, num_layers: int = 2, dropout_rate: float = 0.1):
    inputs = Input(shape=(seq_len, 1))
    x = Dense(d_model)(inputs)

    positions = tf.range(start=0, limit=seq_len, delta=1)
    pos_emb_layer = Embedding(input_dim=seq_len, output_dim=d_model)
    pos_embeddings = pos_emb_layer(positions)
    pos_embeddings = tf.expand_dims(pos_embeddings, axis=0)
    x = x + pos_embeddings

    for _ in range(num_layers):
        attn_out = MultiHeadAttention(num_heads=num_heads, key_dim=d_model)(x, x)
        attn_out = Dropout(dropout_rate)(attn_out)
        x = LayerNormalization(epsilon=1e-6)(x + attn_out)

        ffn = Dense(ff_dim, activation='relu')(x)
        ffn = Dropout(dropout_rate)(ffn)
        ffn = Dense(d_model)(ffn)
        x = LayerNormalization(epsilon=1e-6)(x + ffn)

    x = GlobalAveragePooling1D()(x)
    outputs = Dense(1)(x)
    model = tf.keras.Model(inputs, outputs)
    model.compile(optimizer='adam', loss='mean_squared_error')
    return model


def train_transformer(X: np.ndarray, y: np.ndarray, epochs: int,
                      d_model: int = 64, num_heads: int = 4, ff_dim: int = 128,
                      num_layers: int = 2, dropout_rate: float = 0.1):
    model = build_transformer_model(
        seq_len=X.shape[1],
        d_model=d_model,
        num_heads=num_heads,
        ff_dim=ff_dim,
        num_layers=num_layers,
        dropout_rate=dropout_rate,
    )
    model.fit(X, y, epochs=epochs, batch_size=32, verbose=0)
    return model


