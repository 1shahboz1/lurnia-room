import { loadRoomFinal, RoomNotFoundError, RoomValidationError } from '@/engine/loaders/strictLoader'
import { toEngineConfig } from '@/engine/adapters/fromV1'
import ClientScenario from './ClientScenario'

export default async function ScenarioPage({ params }: { params: { scenario: string } }) {
  const slug = params.scenario
  try {
    const v1 = await loadRoomFinal(slug)
    const engineConfig = toEngineConfig(v1)

    return (
      <ClientScenario engineConfig={engineConfig} slug={slug} />
    )
  } catch (e: any) {
    if (e instanceof RoomNotFoundError) {
      return (
        <div className="h-screen w-full grid place-items-center bg-black text-white">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Room not found</h1>
            <p className="text-gray-400">No final config found for “{slug}”. Expected at /public/rooms/{slug}.final.json</p>
          </div>
        </div>
      )
    }
    if (e instanceof RoomValidationError) {
      return (
        <div className="h-screen w-full grid place-items-center bg-black text-white">
          <div className="max-w-2xl text-left">
            <h1 className="text-2xl font-bold mb-3">Invalid room configuration</h1>
            <p className="text-gray-300 mb-2">The final JSON for “{slug}” failed validation:</p>
            <ul className="list-disc pl-6 text-sm text-red-300 space-y-1">
              {e.details.map((d: string, i: number) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        </div>
      )
    }
    throw e
  }
}
