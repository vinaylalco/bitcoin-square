import { useDebugValue, useSyncExternalStore } from "react";

type StateListener<T> = (state: T, previousState: T) => void;

type SetState<T> = (
  partial: Partial<T> | ((state: T) => Partial<T>),
  replace?: boolean,
) => void;

type GetState<T> = () => T;

type Subscribe<T> = (listener: StateListener<T>) => () => void;

type Selector<T, U> = (state: T) => U;

type EqualityChecker<U> = (a: U, b: U) => boolean;

type StateCreator<T> = (set: SetState<T>, get: GetState<T>) => T;

type UseBoundStore<T> = {
  (): T;
  <U>(selector: Selector<T, U>, equalityFn?: EqualityChecker<U>): U;
  setState: SetState<T>;
  getState: GetState<T>;
  subscribe: Subscribe<T>;
};

const objectIs: EqualityChecker<unknown> = Object.is;

const identity = <T>(value: T) => value;

export type { StateCreator };

export function create<T>(createState: StateCreator<T>) {
  let state: T;
  const listeners = new Set<StateListener<T>>();

  const setState: SetState<T> = (partial, replace) => {
    const partialState =
      typeof partial === "function"
        ? (partial as (state: T) => Partial<T>)(state)
        : partial;

    const previousState = state;

    if (replace || previousState === undefined) {
      state = partialState as T;
    } else {
      state = { ...previousState, ...partialState };
    }

    if (previousState === state) {
      return;
    }

    listeners.forEach((listener) => listener(state, previousState));
  };

  const getState: GetState<T> = () => state;

  const subscribe: Subscribe<T> = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  state = createState(setState, getState);

  const useStoreBase = <U>(
    selector: Selector<T, U> = identity as Selector<T, U>,
    equalityFn: EqualityChecker<U> = objectIs,
  ) => {
    const snapshot = useSyncExternalStore(
      (notify) => subscribe((nextState, prevState) => {
        const selectedNext = selector(nextState);
        const selectedPrev = selector(prevState);
        if (!equalityFn(selectedNext, selectedPrev)) {
          notify();
        }
      }),
      () => selector(state),
      () => selector(state),
    );

    useDebugValue(snapshot);

    return snapshot;
  };

  const useStore = useStoreBase as UseBoundStore<T>;

  useStore.setState = setState;
  useStore.getState = getState;
  useStore.subscribe = subscribe;

  return useStore;
}
