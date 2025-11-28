// src/data/index.js
import { DummyDataSource } from "./sources/dummyDataSource.js";

const SOURCES = {
  dummy: DummyDataSource,
  // después: crypto, weather, analytics, etc.
};

export function createDataSource(type = "dummy") {
  const SourceClass = SOURCES[type] || DummyDataSource;
  return new SourceClass();
}