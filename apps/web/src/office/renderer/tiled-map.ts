export interface OfficeRendererDestination {
  readonly id: string;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly walkable: boolean;
  readonly zoneId: string;
}

export interface OfficeTiledMap {
  readonly destinations: readonly OfficeRendererDestination[];
  readonly layerNames: readonly string[];
  readonly tileSize: Readonly<{ height: number; width: number }>;
}

type TiledPropertyValue = boolean | number | string;

type TiledRecord = Readonly<Record<string, unknown>>;

const asRecord = (value: unknown, label: string): TiledRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as TiledRecord;
};

const asArray = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  return value;
};

const asNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }

  return value;
};

const asString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
};

const propertyMap = (
  value: unknown,
): ReadonlyMap<string, TiledPropertyValue> => {
  const properties = new Map<string, TiledPropertyValue>();

  for (const property of asArray(value ?? [], "Tiled properties")) {
    const record = asRecord(property, "Tiled property");
    const name = asString(record.name, "Tiled property name");
    const propertyValue = record.value;

    if (
      typeof propertyValue !== "string" &&
      typeof propertyValue !== "number" &&
      typeof propertyValue !== "boolean"
    ) {
      throw new Error(`Tiled property ${name} has an unsupported value`);
    }

    properties.set(name, propertyValue);
  }

  return properties;
};

const requiredDestinationProperty = (
  properties: ReadonlyMap<string, TiledPropertyValue>,
  name: "destinationId" | "officeZone" | "walkable",
): TiledPropertyValue => {
  const value = properties.get(name);

  if (value === undefined) {
    throw new Error(
      "destination requires destinationId, officeZone and walkable properties",
    );
  }

  return value;
};

export const parseOfficeTiledMap = (value: unknown): OfficeTiledMap => {
  const map = asRecord(value, "Tiled map");

  if (map.type !== "map") {
    throw new Error("Tiled document must be a map");
  }

  const layers = asArray(map.layers, "Tiled map layers").map((layer) =>
    asRecord(layer, "Tiled layer"),
  );
  const destinationsLayer = layers.find(
    (layer) => layer.name === "destinations" && layer.type === "objectgroup",
  );

  if (destinationsLayer === undefined) {
    throw new Error("Tiled map requires a destinations object layer");
  }

  const destinations = asArray(
    destinationsLayer.objects,
    "Tiled destination objects",
  ).map((object) => {
    const destination = asRecord(object, "Tiled destination");
    const properties = propertyMap(destination.properties);
    const id = requiredDestinationProperty(properties, "destinationId");
    const zoneId = requiredDestinationProperty(properties, "officeZone");
    const walkable = requiredDestinationProperty(properties, "walkable");

    if (
      typeof id !== "string" ||
      typeof zoneId !== "string" ||
      typeof walkable !== "boolean"
    ) {
      throw new Error(
        "destinationId and officeZone must be strings; walkable must be boolean",
      );
    }

    return {
      id,
      position: {
        x: asNumber(destination.x, "Tiled destination x"),
        y: asNumber(destination.y, "Tiled destination y"),
      },
      walkable,
      zoneId,
    };
  });

  return {
    destinations,
    layerNames: layers.map((layer) => asString(layer.name, "Tiled layer name")),
    tileSize: {
      height: asNumber(map.tileheight, "Tiled map tileheight"),
      width: asNumber(map.tilewidth, "Tiled map tilewidth"),
    },
  };
};
