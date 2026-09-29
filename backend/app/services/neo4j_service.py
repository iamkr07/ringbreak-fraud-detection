import os
import logging
from typing import Dict, List, Any, Optional
from neo4j import GraphDatabase, Driver

logger = logging.getLogger(__name__)

NEO4J_URI = os.getenv("NEO4J_URI", "neo4j+s://95b22f3e.databases.neo4j.io")
NEO4J_USERNAME = os.getenv("NEO4J_USERNAME", "95b22f3e")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "4HtNIwreLRGFocc7TiqRdQRm_97oxOIrYKH0OihA4Pc")

class Neo4jService:
    """
    Neo4j Graph Database Continuous Memory Service for RING//BREAK.
    """
    def __init__(self):
        self._driver: Optional[Driver] = None
        self._is_connected: bool = False
        self._init_connection()

    def _init_connection(self):
        try:
            self._driver = GraphDatabase.driver(
                NEO4J_URI,
                auth=(NEO4J_USERNAME, NEO4J_PASSWORD)
            )
            self._driver.verify_connectivity()
            self._is_connected = True
            logger.info("Successfully connected to Neo4j database.")
            self.init_constraints()
        except Exception as e:
            logger.warning(f"Neo4j connection error: {e}. Falling back to in-memory mode.")
            self._is_connected = False

    def is_healthy(self) -> bool:
        if not self._is_connected or self._driver is None:
            return False
        try:
            self._driver.verify_connectivity()
            return True
        except Exception:
            self._is_connected = False
            return False

    def init_constraints(self):
        if not self.is_healthy():
            return
        
        constraints = [
            "CREATE CONSTRAINT account_id_unique IF NOT EXISTS FOR (a:Account) REQUIRE a.account_id IS UNIQUE;",
            "CREATE CONSTRAINT tx_id_unique IF NOT EXISTS FOR (t:Transaction) REQUIRE t.tx_id IS UNIQUE;",
            "CREATE CONSTRAINT ring_id_unique IF NOT EXISTS FOR (r:RingCluster) REQUIRE r.ring_id IS UNIQUE;"
        ]
        with self._driver.session() as session:
            for c in constraints:
                try:
                    session.run(c)
                except Exception as e:
                    logger.debug(f"Constraint creation notice: {e}")

    def store_confirmed_ring(self, ring_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Stores a confirmed ring cluster and links all member accounts in Neo4j.
        """
        if not self.is_healthy():
            return {"status": "fallback", "message": "Neo4j offline. Stored in GNN memory fallback."}

        ring_id = str(ring_data.get("ringId", "UNKNOWN_RING"))
        pattern_type = str(ring_data.get("patternType", "transaction_cycle"))
        confidence = float(ring_data.get("confidence", 85.0))
        members_raw = ring_data.get("members") or ring_data.get("memberNodeIds") or []
        members = [str(m) for m in members_raw]
        amount_involved = float(ring_data.get("amountInvolved", 0.0))

        cypher_query = """
        MERGE (r:RingCluster {ring_id: $ring_id})
        SET r.pattern_type = $pattern_type,
            r.confidence = $confidence,
            r.amount_involved = $amount_involved,
            r.member_count = size($members),
            r.updated_at = datetime()
        WITH r
        UNWIND $members AS member_id
        MERGE (a:Account {account_id: member_id})
        SET a.total_rings_detected = coalesce(a.total_rings_detected, 0) + 1,
            a.is_repeat_offender = (a.total_rings_detected > 1),
            a.last_detected_at = datetime()
        MERGE (a)-[m:MEMBER_OF]->(r)
        SET m.confidence = $confidence, m.updated_at = datetime()
        RETURN r.ring_id AS ring_id, count(a) AS accounts_linked
        """

        with self._driver.session() as session:
            result = session.run(
                cypher_query,
                ring_id=ring_id,
                pattern_type=pattern_type,
                confidence=confidence,
                amount_involved=amount_involved,
                members=members
            )
            record = result.single()
            linked_count = record["accounts_linked"] if record else len(members)

        return {
            "status": "success",
            "ringId": ring_id,
            "patternType": pattern_type,
            "accountsLinked": linked_count,
            "database": "Neo4j Aura"
        }

    def get_node_ring_history(self, account_id: str) -> Dict[str, Any]:
        """
        Performs O(1) Cypher lookup to fetch an account's historical ring involvement from Neo4j.
        """
        account_id = str(account_id)
        if not self.is_healthy():
            return {
                "accountId": account_id,
                "hasHistory": False,
                "totalRings": 0,
                "isRepeatOffender": False,
                "pastRings": [],
                "coConspirators": [],
            }

        cypher_query = """
        MATCH (a:Account {account_id: $account_id})-[m:MEMBER_OF]->(r:RingCluster)
        OPTIONAL MATCH (co:Account)-[:MEMBER_OF]->(r) WHERE co.account_id <> $account_id
        RETURN r.ring_id AS ring_id,
               r.pattern_type AS pattern_type,
               r.confidence AS confidence,
               r.amount_involved AS amount_involved,
               collect(DISTINCT co.account_id) AS co_conspirators,
               a.total_rings_detected AS total_rings,
               a.is_repeat_offender AS is_repeat_offender
        """

        with self._driver.session() as session:
            result = session.run(cypher_query, account_id=account_id)
            records = list(result)

        if not records:
            return {
                "accountId": account_id,
                "hasHistory": False,
                "totalRings": 0,
                "isRepeatOffender": False,
                "pastRings": [],
                "coConspirators": [],
            }

        past_rings = []
        all_coconspirators = set()
        total_rings = 0
        is_repeat = False

        for row in records:
            total_rings = max(total_rings, row["total_rings"] or len(records))
            if row["is_repeat_offender"]:
                is_repeat = True
            
            coconspirators = row["co_conspirators"] or []
            all_coconspirators.update(coconspirators)

            past_rings.append({
                "ringId": row["ring_id"],
                "patternType": row["pattern_type"],
                "confidence": row["confidence"],
                "amountInvolved": row["amount_involved"],
                "coConspirators": coconspirators,
            })

        return {
            "accountId": account_id,
            "hasHistory": True,
            "totalRings": total_rings,
            "isRepeatOffender": is_repeat or total_rings > 1,
            "pastRings": past_rings,
            "coConspirators": sorted(list(all_coconspirators)),
        }

    def close(self):
        if self._driver:
            self._driver.close()

neo4j_service = Neo4jService()
