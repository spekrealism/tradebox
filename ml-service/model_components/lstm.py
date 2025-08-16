import numpy as np
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dropout, Dense
from tensorflow.keras.callbacks import EarlyStopping


def build_lstm(input_timesteps: int) -> Sequential:
    model = Sequential([
        LSTM(50, return_sequences=True, input_shape=(input_timesteps, 1)),
        Dropout(0.2),
        LSTM(50, return_sequences=True),
        Dropout(0.2),
        LSTM(50),
        Dropout(0.2),
        Dense(1),
    ])
    model.compile(optimizer='adam', loss='mean_squared_error')
    return model


def train_lstm(X: np.ndarray, y: np.ndarray, epochs: int) -> Sequential:
    if X.ndim != 3:
        raise ValueError('Expected X shape (samples, timesteps, features)')

    early_stop = EarlyStopping(monitor='loss', patience=5, restore_best_weights=True)
    model = build_lstm(input_timesteps=X.shape[1])
    model.fit(X, y, epochs=epochs, batch_size=32, callbacks=[early_stop], verbose=0)
    return model


