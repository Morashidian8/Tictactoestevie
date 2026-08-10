"""
The candidate library: every rule this hunt tries, across eight families.

A rule is a generator of (index, side) pairs, side +1 meaning "the next candle
closes up". Both the follow and the fade reading of a condition are registered
wherever both are defensible, because which way a condition points is exactly
what is being measured, not assumed.

Nothing here is tuned. Thresholds are the textbook ones or a small grid around
them, and the grid size is counted so the multiple-testing bar can be set from
it honestly rather than after the fact.
"""

import hunt_lib as H


def build(d):
    """Precompute every series once. Returns a dict of named series."""
    c, o, h, l, v, n = d["c"], d["o"], d["h"], d["l"], d["v"], d["n"]
    S = {}
    for p in (2, 7, 14, 21):
        S[f"rsi{p}"] = H.rsi(c, p)
    for p in (9, 14, 21):
        S[f"stoch{p}"] = H.stoch(d, p)
        S[f"wr{p}"] = H.williams_r(d, p)
    S["cci20"] = H.cci(d, 20)
    S["mfi14"] = H.mfi(d, 14)
    S["adx14"], S["pdi14"], S["ndi14"] = H.adx_di(d, 14)
    S["macd"], S["macdsig"], S["macdhist"] = H.macd(c)
    S["atr14"] = H.wilder(H.true_range(d), 14)
    for p in (9, 20, 21, 50, 100, 200):
        S[f"ema{p}"] = H.ema(c, p)
        S[f"sma{p}"] = H.sma(c, p)
    for p in (10, 20, 50):
        S[f"hh{p}"] = H.rolling_max(h, p)
        S[f"ll{p}"] = H.rolling_min(l, p)
    S["sd20"] = H.stdev(c, 20)
    S["vwap"] = H.vwap_session(d)
    S["vsma20"] = H.sma(v, 20)
    S["ret"] = [0.0] + [(c[i] - c[i - 1]) / c[i - 1] if c[i - 1] else 0.0
                        for i in range(1, n)]
    S["retsd100"] = H.stdev(S["ret"], 100)
    S["body"] = [abs(c[i] - o[i]) for i in range(n)]
    S["range"] = [h[i] - l[i] for i in range(n)]
    S["bodysma20"] = H.sma(S["body"], 20)
    S["rangesma20"] = H.sma(S["range"], 20)
    S["absret"] = [abs(x) for x in S["ret"]]
    S["absretsma100"] = H.sma(S["absret"], 100)
    return S


def rules(d, S):
    """
    Yield (family, name, pairs) where pairs is [(index, side), ...].

    Every rule is causal: index i decides a bet on the candle after i.
    """
    c, o, h, l, v, n = d["c"], d["o"], d["h"], d["l"], d["v"], d["n"]
    W = 210                                  # warm-up so every series is ready
    rng = range(W, n - 1)

    def emit(fam, name, cond):
        """cond(i) -> side (+1/-1) or None."""
        pairs = [(i, s) for i in rng for s in (cond(i),) if s]
        if len(pairs) >= H.MIN_N:
            yield_pairs.append((fam, name, pairs))
        return ()          # so the `list(emit(...))` call sites stay valid

    yield_pairs = []

    # ---------------------------------------------------------------- A. oscillators
    for p in (2, 7, 14, 21):
        r = S[f"rsi{p}"]
        for lo, hi in ((10, 90), (20, 80), (30, 70), (35, 65)):
            list(emit("oscillator", f"RSI{p}<{lo} fade", lambda i, r=r, lo=lo:
                      +1 if (r[i] is not None and r[i] < lo) else None))
            list(emit("oscillator", f"RSI{p}>{hi} fade", lambda i, r=r, hi=hi:
                      -1 if (r[i] is not None and r[i] > hi) else None))
            list(emit("oscillator", f"RSI{p}<{lo} follow", lambda i, r=r, lo=lo:
                      -1 if (r[i] is not None and r[i] < lo) else None))
    for p in (9, 14, 21):
        st, wr = S[f"stoch{p}"], S[f"wr{p}"]
        for lo, hi in ((10, 90), (20, 80)):
            list(emit("oscillator", f"Stoch{p}<{lo} fade", lambda i, st=st, lo=lo:
                      +1 if (st[i] is not None and st[i] < lo) else None))
            list(emit("oscillator", f"Stoch{p}>{hi} fade", lambda i, st=st, hi=hi:
                      -1 if (st[i] is not None and st[i] > hi) else None))
        list(emit("oscillator", f"WilliamsR{p}<-90 fade", lambda i, wr=wr:
                  +1 if (wr[i] is not None and wr[i] < -90) else None))
        list(emit("oscillator", f"WilliamsR{p}>-10 fade", lambda i, wr=wr:
                  -1 if (wr[i] is not None and wr[i] > -10) else None))
    for th in (100, 150, 200, 250):
        cc = S["cci20"]
        list(emit("oscillator", f"CCI20>{th} fade", lambda i, th=th:
                  -1 if (cc[i] is not None and cc[i] > th) else None))
        list(emit("oscillator", f"CCI20<-{th} fade", lambda i, th=th:
                  +1 if (cc[i] is not None and cc[i] < -th) else None))
    for lo, hi in ((10, 90), (20, 80)):
        mf = S["mfi14"]
        list(emit("volume", f"MFI14<{lo} fade", lambda i, lo=lo:
                  +1 if (mf[i] is not None and mf[i] < lo) else None))
        list(emit("volume", f"MFI14>{hi} fade", lambda i, hi=hi:
                  -1 if (mf[i] is not None and mf[i] > hi) else None))

    # ---------------------------------------------------------------- B. trend
    for f_, s_ in ((9, 21), (20, 50), (50, 200)):
        a, b = S[f"ema{f_}"], S[f"ema{s_}"]
        list(emit("trend", f"EMA{f_}x{s_} up follow", lambda i, a=a, b=b:
                  +1 if (a[i] and b[i] and a[i - 1] and b[i - 1]
                         and a[i - 1] <= b[i - 1] and a[i] > b[i]) else None))
        list(emit("trend", f"EMA{f_}x{s_} dn follow", lambda i, a=a, b=b:
                  -1 if (a[i] and b[i] and a[i - 1] and b[i - 1]
                         and a[i - 1] >= b[i - 1] and a[i] < b[i]) else None))
        list(emit("trend", f"EMA{f_}x{s_} up fade", lambda i, a=a, b=b:
                  -1 if (a[i] and b[i] and a[i - 1] and b[i - 1]
                         and a[i - 1] <= b[i - 1] and a[i] > b[i]) else None))
    ml, ms, mh = S["macd"], S["macdsig"], S["macdhist"]
    list(emit("trend", "MACD cross up follow", lambda i:
              +1 if (mh[i] is not None and mh[i - 1] is not None
                     and mh[i - 1] <= 0 < mh[i]) else None))
    list(emit("trend", "MACD cross dn follow", lambda i:
              -1 if (mh[i] is not None and mh[i - 1] is not None
                     and mh[i - 1] >= 0 > mh[i]) else None))
    list(emit("trend", "MACD cross up fade", lambda i:
              -1 if (mh[i] is not None and mh[i - 1] is not None
                     and mh[i - 1] <= 0 < mh[i]) else None))
    ad, pd_, nd = S["adx14"], S["pdi14"], S["ndi14"]
    for th in (20, 25, 30):
        list(emit("trend", f"ADX>{th} +DI follow", lambda i, th=th:
                  +1 if (ad[i] and ad[i] > th and pd_[i] and nd[i]
                         and pd_[i] > nd[i]) else None))
        list(emit("trend", f"ADX>{th} -DI follow", lambda i, th=th:
                  -1 if (ad[i] and ad[i] > th and pd_[i] and nd[i]
                         and nd[i] > pd_[i]) else None))
        list(emit("trend", f"ADX<{th} +DI fade", lambda i, th=th:
                  -1 if (ad[i] and ad[i] < th and pd_[i] and nd[i]
                         and pd_[i] > nd[i]) else None))

    # ---------------------------------------------------------------- C. channels
    for k in (1.5, 2.0, 2.5, 3.0):
        sd, m = S["sd20"], S["sma20"]
        list(emit("channel", f"BB{k} upper fade", lambda i, k=k:
                  -1 if (sd[i] and m[i] and c[i] > m[i] + k * sd[i]) else None))
        list(emit("channel", f"BB{k} lower fade", lambda i, k=k:
                  +1 if (sd[i] and m[i] and c[i] < m[i] - k * sd[i]) else None))
        list(emit("channel", f"BB{k} upper follow", lambda i, k=k:
                  +1 if (sd[i] and m[i] and c[i] > m[i] + k * sd[i]) else None))
        at, e = S["atr14"], S["ema20"]
        list(emit("channel", f"Keltner{k} upper fade", lambda i, k=k:
                  -1 if (at[i] and e[i] and c[i] > e[i] + k * at[i]) else None))
        list(emit("channel", f"Keltner{k} lower fade", lambda i, k=k:
                  +1 if (at[i] and e[i] and c[i] < e[i] - k * at[i]) else None))
    for p in (10, 20, 50):
        hh, ll = S[f"hh{p}"], S[f"ll{p}"]
        list(emit("channel", f"Donchian{p} break-up fade", lambda i, hh=hh, p=p:
                  -1 if (hh[i - 1] and c[i] > hh[i - 1]) else None))
        list(emit("channel", f"Donchian{p} break-dn fade", lambda i, ll=ll, p=p:
                  +1 if (ll[i - 1] and c[i] < ll[i - 1]) else None))
        list(emit("channel", f"Donchian{p} break-up follow", lambda i, hh=hh, p=p:
                  +1 if (hh[i - 1] and c[i] > hh[i - 1]) else None))

    # ---------------------------------------------------------------- D. candlesticks
    def bull_engulf(i):
        return (c[i - 1] < o[i - 1] and c[i] > o[i]
                and c[i] >= o[i - 1] and o[i] <= c[i - 1])

    def bear_engulf(i):
        return (c[i - 1] > o[i - 1] and c[i] < o[i]
                and o[i] >= c[i - 1] and c[i] <= o[i - 1])

    list(emit("candlestick", "bullish engulfing follow", lambda i:
              +1 if bull_engulf(i) else None))
    list(emit("candlestick", "bullish engulfing fade", lambda i:
              -1 if bull_engulf(i) else None))
    list(emit("candlestick", "bearish engulfing follow", lambda i:
              -1 if bear_engulf(i) else None))
    list(emit("candlestick", "bearish engulfing fade", lambda i:
              +1 if bear_engulf(i) else None))

    def upper_wick(i):
        return h[i] - max(o[i], c[i])

    def lower_wick(i):
        return min(o[i], c[i]) - l[i]

    for k in (2.0, 3.0):
        list(emit("candlestick", f"hammer(wick>{k}xbody) follow", lambda i, k=k:
                  +1 if (S["body"][i] > 0 and lower_wick(i) > k * S["body"][i]
                         and upper_wick(i) < S["body"][i]) else None))
        list(emit("candlestick", f"shooting star(wick>{k}xbody) follow", lambda i, k=k:
                  -1 if (S["body"][i] > 0 and upper_wick(i) > k * S["body"][i]
                         and lower_wick(i) < S["body"][i]) else None))
        list(emit("candlestick", f"hammer(wick>{k}xbody) fade", lambda i, k=k:
                  -1 if (S["body"][i] > 0 and lower_wick(i) > k * S["body"][i]
                         and upper_wick(i) < S["body"][i]) else None))
    list(emit("candlestick", "doji fade prev", lambda i:
              (-1 if c[i - 1] > o[i - 1] else +1)
              if (S["rangesma20"][i] and S["body"][i] < 0.1 * S["rangesma20"][i])
              else None))
    list(emit("candlestick", "inside bar follow prev", lambda i:
              (+1 if c[i - 1] > o[i - 1] else -1)
              if (h[i] < h[i - 1] and l[i] > l[i - 1]) else None))
    list(emit("candlestick", "outside bar fade", lambda i:
              (-1 if c[i] > o[i] else +1)
              if (h[i] > h[i - 1] and l[i] < l[i - 1]) else None))
    for k in (0.8, 0.9):
        list(emit("candlestick", f"marubozu({k}) follow", lambda i, k=k:
                  (+1 if c[i] > o[i] else -1)
                  if (S["range"][i] > 0 and S["body"][i] > k * S["range"][i]
                      and S["range"][i] > S["rangesma20"][i]) else None))
        list(emit("candlestick", f"marubozu({k}) fade", lambda i, k=k:
                  (-1 if c[i] > o[i] else +1)
                  if (S["range"][i] > 0 and S["body"][i] > k * S["range"][i]
                      and S["range"][i] > S["rangesma20"][i]) else None))
    list(emit("candlestick", "three white soldiers fade", lambda i:
              -1 if all(c[j] > o[j] for j in (i, i - 1, i - 2))
              and c[i] > c[i - 1] > c[i - 2] else None))
    list(emit("candlestick", "three black crows fade", lambda i:
              +1 if all(c[j] < o[j] for j in (i, i - 1, i - 2))
              and c[i] < c[i - 1] < c[i - 2] else None))

    # ---------------------------------------------------------------- E. structure
    list(emit("structure", "liquidity sweep high fade", lambda i:
              -1 if (h[i] > h[i - 1] and c[i] < h[i - 1]
                     and S["range"][i] > S["rangesma20"][i]) else None))
    list(emit("structure", "liquidity sweep low fade", lambda i:
              +1 if (l[i] < l[i - 1] and c[i] > l[i - 1]
                     and S["range"][i] > S["rangesma20"][i]) else None))
    list(emit("structure", "FVG up follow", lambda i:
              +1 if l[i] > h[i - 2] else None))
    list(emit("structure", "FVG down follow", lambda i:
              -1 if h[i] < l[i - 2] else None))
    list(emit("structure", "FVG up fade", lambda i:
              -1 if l[i] > h[i - 2] else None))
    for p in (3, 4, 5):
        list(emit("structure", f"{p} higher highs fade", lambda i, p=p:
                  -1 if all(h[i - j] > h[i - j - 1] for j in range(p)) else None))
        list(emit("structure", f"{p} lower lows fade", lambda i, p=p:
                  +1 if all(l[i - j] < l[i - j - 1] for j in range(p)) else None))
        list(emit("structure", f"{p} higher highs follow", lambda i, p=p:
                  +1 if all(h[i - j] > h[i - j - 1] for j in range(p)) else None))
    list(emit("structure", "equal highs fade", lambda i:
              -1 if (S["atr14"][i] and abs(h[i] - h[i - 1]) < 0.05 * S["atr14"][i]
                     and c[i] > o[i]) else None))

    # ---------------------------------------------------------------- F. volume
    for k in (2.0, 3.0, 4.0):
        list(emit("volume", f"vol>{k}x avg + up fade", lambda i, k=k:
                  -1 if (S["vsma20"][i] and v[i] > k * S["vsma20"][i]
                         and c[i] > o[i]) else None))
        list(emit("volume", f"vol>{k}x avg + dn fade", lambda i, k=k:
                  +1 if (S["vsma20"][i] and v[i] > k * S["vsma20"][i]
                         and c[i] < o[i]) else None))
        list(emit("volume", f"vol>{k}x avg + up follow", lambda i, k=k:
                  +1 if (S["vsma20"][i] and v[i] > k * S["vsma20"][i]
                         and c[i] > o[i]) else None))
    for k in (0.002, 0.004, 0.006):
        vw = S["vwap"]
        list(emit("volume", f"VWAP dev>+{k} fade", lambda i, k=k:
                  -1 if (vw[i] and (c[i] - vw[i]) / vw[i] > k) else None))
        list(emit("volume", f"VWAP dev<-{k} fade", lambda i, k=k:
                  +1 if (vw[i] and (c[i] - vw[i]) / vw[i] < -k) else None))
    list(emit("volume", "low vol + big body fade", lambda i:
              (-1 if c[i] > o[i] else +1)
              if (S["vsma20"][i] and v[i] < 0.5 * S["vsma20"][i]
                  and S["body"][i] > S["bodysma20"][i]) else None))

    # ---------------------------------------------------------------- G. statistical
    for k in (2.0, 2.5, 3.0, 4.0):
        rs = S["retsd100"]
        list(emit("statistical", f"return z>{k} fade", lambda i, k=k:
                  -1 if (rs[i] and S["ret"][i] > k * rs[i]) else None))
        list(emit("statistical", f"return z<-{k} fade", lambda i, k=k:
                  +1 if (rs[i] and S["ret"][i] < -k * rs[i]) else None))
        list(emit("statistical", f"return z>{k} follow", lambda i, k=k:
                  +1 if (rs[i] and S["ret"][i] > k * rs[i]) else None))
    for k in (3, 4, 5, 6, 7):
        list(emit("statistical", f"run of {k} same colour fade", lambda i, k=k:
                  (-1 if c[i] > o[i] else +1)
                  if all((c[i - j] > o[i - j]) == (c[i] > o[i]) for j in range(k))
                  and c[i] != o[i] else None))
        list(emit("statistical", f"run of {k} same colour follow", lambda i, k=k:
                  (+1 if c[i] > o[i] else -1)
                  if all((c[i - j] > o[i - j]) == (c[i] > o[i]) for j in range(k))
                  and c[i] != o[i] else None))
    for k in (3, 5, 8):
        list(emit("statistical", f"{k}-bar net move >2 ATR fade", lambda i, k=k:
                  (-1 if c[i] > c[i - k] else +1)
                  if (S["atr14"][i] and abs(c[i] - c[i - k]) > 2 * S["atr14"][i])
                  else None))
    for k in (1.5, 2.0, 3.0):
        list(emit("statistical", f"gap from SMA20 >{k} ATR fade", lambda i, k=k:
                  (-1 if c[i] > S["sma20"][i] else +1)
                  if (S["sma20"][i] and S["atr14"][i]
                      and abs(c[i] - S["sma20"][i]) > k * S["atr14"][i]) else None))
    list(emit("statistical", "range expansion fade", lambda i:
              (-1 if c[i] > o[i] else +1)
              if (S["rangesma20"][i] and S["range"][i] > 3 * S["rangesma20"][i])
              else None))
    list(emit("statistical", "volatility squeeze follow", lambda i:
              (+1 if c[i] > o[i] else -1)
              if (S["rangesma20"][i] and S["range"][i] < 0.4 * S["rangesma20"][i])
              else None))

    # ---------------------------------------------------------------- H. multi-timeframe
    def htf_dir(i, k):
        """Direction of the k-candle block that just completed."""
        j = i - (i % k)
        return None if j - k < 0 else (1 if c[j] > c[j - k] else -1)

    for k in (3, 6, 12):                      # 15m, 30m, 60m context
        for th in (2.0, 3.0):
            list(emit("multi-timeframe", f"{k*5}m up + z<-{th} fade", lambda i, k=k, th=th:
                      +1 if (htf_dir(i, k) == 1 and S["retsd100"][i]
                             and S["ret"][i] < -th * S["retsd100"][i]) else None))
            list(emit("multi-timeframe", f"{k*5}m dn + z>{th} fade", lambda i, k=k, th=th:
                      -1 if (htf_dir(i, k) == -1 and S["retsd100"][i]
                             and S["ret"][i] > th * S["retsd100"][i]) else None))
        list(emit("multi-timeframe", f"{k*5}m trend follow", lambda i, k=k:
                  htf_dir(i, k)))
        list(emit("multi-timeframe", f"{k*5}m trend fade", lambda i, k=k:
                  None if htf_dir(i, k) is None else -htf_dir(i, k)))

    return yield_pairs
