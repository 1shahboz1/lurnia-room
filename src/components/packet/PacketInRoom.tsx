import * as React from "react";
import PacketPanelContent from "@/components/packet/PacketPanelContent";

export interface PacketInRoomProps {
  position: [number, number, number];
  rotationY?: number;
  editModeEnabled?: boolean;
}

export default function PacketInRoom({
  position,
  rotationY = 0,
  editModeEnabled = false,
}: PacketInRoomProps) {
  const [selectedType, setSelectedType] = React.useState<string>('HTTP_REQUEST')
  const [selectedProtocol, setSelectedProtocol] = React.useState<string>('TCP')
  const [selectedFlag, setSelectedFlag] = React.useState<string>('SYN')
  const [selectedEncrypted, setSelectedEncrypted] = React.useState<string>('TRUE')

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Front face (editable) */}
      <group position={[0, 0, 0.001]}>
        <PacketPanelContent
          typeValue={selectedType}
          protocolValue={selectedProtocol}
          flagValue={selectedFlag}
          encryptedValue={selectedEncrypted}
          editable={!!editModeEnabled}
          onSelectType={(id) => setSelectedType(id)}
          onSelectProtocol={(id) => setSelectedProtocol(id)}
          onSelectFlag={(id) => setSelectedFlag(id)}
          onSelectEncrypted={(id) => setSelectedEncrypted(id)}
        />
      </group>
      {/* Back face (mirrored, read-only) */}
      <group rotation={[0, Math.PI, 0]} position={[0, 0, -0.001]}>
        <PacketPanelContent typeValue={selectedType} protocolValue={selectedProtocol} flagValue={selectedFlag} encryptedValue={selectedEncrypted} editable={false} />
      </group>
    </group>
  );
}
