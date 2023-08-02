import { TENDERLY_ACCESS_KEY, TENDERLY_PROJECT, TENDERLY_USER } from "../../consts/config"
import { failureResult, successResult } from "../../features/api/utils"

export default async function handler(req,res){
  const data=req.body
  if(!TENDERLY_ACCESS_KEY || !TENDERLY_PROJECT || !TENDERLY_USER){
    console.log("ENV not defined")
    res.json(failureResult("Explorer Issues"))
    return null
  }
  try {
    const resp = await fetch(
      `https://api.tenderly.co/api/v1/account/${TENDERLY_USER}/project/${TENDERLY_PROJECT}/simulate`,
      {
        method:'POST',
        body:data,
        headers: {
          'X-Access-Key': TENDERLY_ACCESS_KEY as string,
        },
      }
    );
    const simulationId=await resp.json().then((data)=>data.simulation.id)
    await fetch(
      `https://api.tenderly.co/api/v1/account/${TENDERLY_USER}/project/${TENDERLY_PROJECT}/simulations/${simulationId}/share`,
      {
        method:'POST',
        headers: {
          'X-Access-Key': TENDERLY_ACCESS_KEY as string,
        },
      }
    )
    res.json(successResult(simulationId))
  } catch (error) {
    res.json(failureResult("Could not simulate"))
  }
}